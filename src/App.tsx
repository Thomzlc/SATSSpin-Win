import { useEffect, useMemo, useRef, useState } from "react";

type Prize = { label: string; weight?: number };

// ✅ 8 wedges (Luggage Tag repeated twice)
const PRIZES: Prize[] = [
  { label: "Tote Bag" },
  { label: "Phone Holder" },
  { label: "Luggage Tag" },
  { label: "Pouch" },
  { label: "Phone Ring" },
  { label: "Ez-link Card" },
  { label: "Towel" },
  { label: "Luggage Tag" }, // repeated
];

// -------------------- Inventory --------------------
type Inventory = Record<string, number>;
const INVENTORY_KEY = "spinwin_inventory_v1";
const ADMIN_PASSWORD = "1234";

// Default starting stock (edit these numbers if you want a different baseline)
const DEFAULT_INVENTORY: Inventory = {
  "Tote Bag": 20,
  "Phone Holder": 30,
  "Luggage Tag": 50,
  "Pouch": 25,
  "Phone Ring": 40,
  "Ez-link Card": 15,
  Towel: 10,
};

function loadInventory(): Inventory {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) return { ...DEFAULT_INVENTORY };
    const parsed = JSON.parse(raw) as Inventory;
    // Merge to ensure new prizes/default keys are present
    return { ...DEFAULT_INVENTORY, ...parsed };
  } catch {
    return { ...DEFAULT_INVENTORY };
  }
}

function saveInventory(inv: Inventory) {
  localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv));
}

// Weighted pick among only in-stock prizes.
// Returns index in PRIZES, or -1 if none available.
function weightedPickIndexAvailable(items: Prize[], inventory: Inventory) {
  const eligible: { idx: number; w: number }[] = [];

  for (let i = 0; i < items.length; i++) {
    const label = items[i].label;
    const remaining = inventory[label] ?? 0;
    if (remaining <= 0) continue;

    const w = Math.max(0, items[i].weight ?? 1);
    if (w > 0) eligible.push({ idx: i, w });
  }

  if (eligible.length === 0) return -1;

  const total = eligible.reduce((a, x) => a + x.w, 0);
  let r = Math.random() * total;

  for (const e of eligible) {
    r -= e.w;
    if (r <= 0) return e.idx;
  }

  return eligible[eligible.length - 1].idx;
}

export default function App() {
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [lastWinner, setLastWinner] = useState<string | null>(null);

  const wheelRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);

  // 🔊 spin audio (public/wheel-tick.mp3)
  const spinAudioRef = useRef<HTMLAudioElement | null>(null);

  // Inventory state (persisted)
  const [inventory, setInventory] = useState<Inventory>(() => loadInventory());

  useEffect(() => {
    saveInventory(inventory);
  }, [inventory]);

  const uniquePrizeLabels = useMemo(() => {
    const set = new Set<string>();
    for (const p of PRIZES) set.add(p.label);
    return Array.from(set);
  }, []);

  const anyStockLeft = useMemo(() => {
    return uniquePrizeLabels.some((label) => (inventory[label] ?? 0) > 0);
  }, [inventory, uniquePrizeLabels]);

  // -------------------- Admin / Manage Inventory UI --------------------
  const [showManage, setShowManage] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);

  // A draft copy for editing before saving
  const [inventoryDraft, setInventoryDraft] = useState<Inventory>(() => ({
    ...loadInventory(),
  }));

  function openManage() {
    setShowManage(true);
    setAdminUnlocked(false);
    setAdminPass("");
    setAdminError(null);
    setInventoryDraft({ ...inventory });
  }

  function closeManage() {
    setShowManage(false);
    setAdminUnlocked(false);
    setAdminPass("");
    setAdminError(null);
  }

  function submitAdminPassword() {
    if (adminPass === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setAdminError(null);
    } else {
      setAdminError("Wrong password.");
      setAdminUnlocked(false);
    }
  }

  function saveDraft() {
    // Clamp to non-negative integers
    const next: Inventory = { ...inventory };
    for (const label of uniquePrizeLabels) {
      const raw = inventoryDraft[label];
      const cleaned = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
      next[label] = cleaned;
    }
    setInventory(next);
    closeManage();
  }

  function setDraftValue(label: string, value: string) {
    const num = value === "" ? 0 : Number(value);
    setInventoryDraft((prev) => ({
      ...prev,
      [label]: Number.isFinite(num) ? num : 0,
    }));
  }

  // -------------------- Wheel rendering --------------------
  const n = PRIZES.length; // 8
  const slice = 360 / n;

  const segments = PRIZES.map((p, i) => ({
    ...p,
    i,
    startDeg: slice * i,
    endDeg: slice * (i + 1),
    centerDeg: slice * (i + 0.5),
  }));

  const wheelGradient = (() => {
    const border = 0.7;

    const stops = segments.map((_, idx) => {
      const start = idx * slice;
      const end = idx === n - 1 ? 360 : (idx + 1) * slice;

      const color = idx % 2 === 0 ? "#EE2536" : "#FFFFFF";
      const line = "rgba(0,0,0,0.12)";

      const a = start.toFixed(4);
      const b = (start + border).toFixed(4);
      const c = (end - border).toFixed(4);
      const d = end.toFixed(4);

      return `${line} ${a}deg ${b}deg, ${color} ${b}deg ${c}deg, ${line} ${c}deg ${d}deg`;
    });

    return `conic-gradient(${stops.join(",")})`;
  })();

  function startSpinSound() {
    const a = spinAudioRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.loop = false; // your current behaviour
    a.play().catch(() => {});
  }

  function stopSpinSound() {
    const a = spinAudioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }

  function doSpin() {
    if (spinning) return;
    if (!anyStockLeft) return;

    setWinner(null);
    setSpinning(true);

    // 🔊 start sound on user gesture (button click)
    startSpinSound();

    const pickedIdx = weightedPickIndexAvailable(PRIZES, inventory);
    if (pickedIdx === -1) {
      // No eligible prizes left
      stopSpinSound();
      setWinner("Out of stock");
      setSpinning(false);
      return;
    }

    const picked = segments[pickedIdx];

    const fullRotations = 40 + Math.floor(Math.random() * 3); // 4–6 full rotations
    const jitter = Math.random() * 10 - 5;

    const current = rotationRef.current;
    const currentMod = ((current % 360) + 360) % 360;

    const targetMod = (360 - picked.centerDeg + 360) % 360;
    const delta = (targetMod - currentMod + 360) % 360;

    const finalDeg = current + fullRotations * 360 + delta + jitter;

    const el = wheelRef.current;
    if (el) {
      el.style.transition = "none";
      void el.offsetWidth; // force reflow
      el.style.transition =
        "transform 3.4s cubic-bezier(0.12, 0.82, 0.2, 1)";
      el.style.transform = `rotate(${finalDeg}deg)`;
    }

    rotationRef.current = finalDeg;

    window.setTimeout(() => {
      stopSpinSound();

      // ✅ decrement inventory for the winning prize label
      setInventory((prev) => {
        const next = { ...prev };
        const label = picked.label;
        next[label] = Math.max(0, (next[label] ?? 0) - 1);
        return next;
      });

      setWinner(picked.label);
      setLastWinner(picked.label);
      setSpinning(false);
    }, 3500);
  }

  function nextPerson() {
    setWinner(null);
  }

  async function goFullscreen() {
    const root = document.documentElement;
    try {
      if (!document.fullscreenElement) await root.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // ignore
    }
  }

  const audioSrc = `${import.meta.env.BASE_URL}wheel-tick.mp3`;

  return (
    <div className="page">
      {/* 🔊 Put audio in the DOM; BASE_URL fixes GitHub Pages paths */}
      <audio ref={spinAudioRef} src={audioSrc} preload="auto" />

      <header className="header">
        <div>
          <img
            src="https://i.postimg.cc/L6DMNQVN/Sats-Logo-Colour-PANTONE-Positive-V1-Sep2024.png"
            alt="SATS Ltd"
            className="logo"
          />
          <div className="title">Spin-to-Win</div>
          <div className="subtitle">Door gift for walk-in recruitment</div>
        </div>

        <div className="headerActions">
          <button className="ghostBtn" onClick={goFullscreen}>
            Fullscreen
          </button>
        </div>
      </header>

      <main className="mainGrid">
        <section className="wheelCard">
          <div className="wheelWrap">
            <div className="pointer" aria-hidden="true" />

            <div
              className="wheel"
              ref={wheelRef}
              style={{ background: wheelGradient }}
              aria-label="Spin wheel"
            >
              {/* ✅ Labels on every wedge */}
              {segments.map((s) => (
                <div
                  key={`${s.i}-${s.label}`}
                  className="wedgeLabel"
                  style={{
                    transform: `rotate(${s.centerDeg}deg) translateY(-38%)`,
                  }}
                >
                  <span style={{ transform: "rotate(90deg)" }}>{s.label}</span>
                </div>
              ))}

              <div className="hub" aria-hidden="true">
                SPIN
              </div>
            </div>
          </div>
        </section>

        <aside className="side">
          <button
            className="primaryBtn"
            onClick={doSpin}
            disabled={spinning || !anyStockLeft}
            title={!anyStockLeft ? "All prizes are out of stock" : undefined}
          >
            {spinning ? "Spinning…" : anyStockLeft ? "Spin the Wheel" : "Out of stock"}
          </button>

          <div className="panel">
            <div className="panelTitle">Result</div>

            {!winner ? (
              <div className="panelBody subtle">
                {spinning ? "Good luck…" : 'Tap “Spin the Wheel” to start.'}
              </div>
            ) : (
              <div className="panelBody">
                <div className="winner">{winner}</div>
                <div className="btnRow">
                  <button className="secondaryBtn" onClick={nextPerson}>
                    Next person
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panelTitle">Prizes</div>

            <div className="list">
              {uniquePrizeLabels.map((label) => {
                const remaining = inventory[label] ?? 0;
                const out = remaining <= 0;
                return (
                  <div
                    key={label}
                    className="listRow"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      opacity: out ? 0.45 : 1,
                    }}
                  >
                    <span>
                      {label} {out ? "(Out)" : ""}
                    </span>
                    <span
                      className="chip"
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        border: "1px solid rgba(0,0,0,0.12)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {remaining} left
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ✅ Manage inventory */}
            <div style={{ marginTop: 12 }}>
              <button className="secondaryBtn" onClick={openManage}>
                Manage inventory
              </button>

              {showManage && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "rgba(255,255,255,0.6)",
                  }}
                >
                  {!adminUnlocked ? (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>
                        Admin access
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="password"
                          value={adminPass}
                          onChange={(e) => setAdminPass(e.target.value)}
                          placeholder="Enter admin password"
                          style={{
                            flex: 1,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(0,0,0,0.2)",
                          }}
                        />
                        <button className="primaryBtn" onClick={submitAdminPassword}>
                          Unlock
                        </button>
                        <button className="ghostBtn" onClick={closeManage}>
                          Cancel
                        </button>
                      </div>
                      {adminError ? (
                        <div style={{ marginTop: 8, color: "#b00020" }}>
                          {adminError}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>
                        Edit stock levels
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {uniquePrizeLabels.map((label) => (
                          <div
                            key={`edit-${label}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 110px",
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{label}</div>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={String(inventoryDraft[label] ?? 0)}
                              onChange={(e) => setDraftValue(label, e.target.value)}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid rgba(0,0,0,0.2)",
                                textAlign: "right",
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="primaryBtn" onClick={saveDraft}>
                          Save
                        </button>
                        <button className="secondaryBtn" onClick={() => setInventoryDraft({ ...inventory })}>
                          Reset changes
                        </button>
                        <button className="ghostBtn" onClick={closeManage}>
                          Close
                        </button>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                        Stocks are saved on this device (localStorage).
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="panel small">
            <div className="panelTitle">History</div>
            <div className="panelBody subtle">
              {lastWinner ? (
                <div style={{ marginTop: 8 }}>
                  Last winner: <b>{lastWinner}</b>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </main>

      <footer className="footer">
        <span className="footSubtle">
          Note: Inventory is tracked on this device. Outcomes remain random based
          on prize weights (if set) and available stock.
        </span>
      </footer>
    </div>
  );
}
