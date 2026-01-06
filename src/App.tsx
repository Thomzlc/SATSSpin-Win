import { useRef, useState } from "react";

type Prize = { label: string; weight?: number };

// ✅ 8 wedges (Luggage Tag repeated twice)
const PRIZES: Prize[] = [
  { label: 'Tote Bag' },
  { label: 'Phone Holder' },
  { label: 'Luggage Tag' },
  { label: 'Pouch' },
  { label: 'Phone Ring' },
  { label: 'Ez-link Card' },
  { label: 'Towel' },
  { label: 'Luggage Tag' }, // repeated
];

// Weighted pick (defaults to equal odds if weight not set)
function weightedPickIndex(items: Prize[]) {
  const weights = items.map((p) => Math.max(0, p.weight ?? 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r < acc) return i;
  }
  return items.length - 1;
}

function playSpinSound() {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const duration = 3400;
  const startTime = audioCtx.currentTime;

  let intervalId: number;

  const playClick = () => {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.value = 180 + Math.random() * 40;
    oscillator.type = 'square';

    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.03);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.03);
  };

  const scheduleClicks = () => {
    const elapsed = Date.now() - startTime * 1000;
    const progress = Math.min(elapsed / duration, 1);

    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const interval = 20 + easedProgress * 180;

    if (progress < 1) {
      playClick();
      intervalId = window.setTimeout(scheduleClicks, interval);
    }
  };

  scheduleClicks();

  return () => {
    if (intervalId) clearTimeout(intervalId);
    audioCtx.close();
  };
}

export default function App() {
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [lastWinner, setLastWinner] = useState<string | null>(null);

  const wheelRef = useRef<HTMLDivElement>(null);
  const soundCleanupRef = useRef<(() => void) | null>(null);

  const n = PRIZES.length; // 8
  const slice = 360 / n;

  const segments = PRIZES.map((p, i) => ({
    ...p,
    i,
    startDeg: slice * i,
    endDeg: slice * (i + 1),
    centerDeg: slice * (i + 0.5),
  }));

  // ✅ Red/white alternating + thin separators so wedges always read cleanly
  const wheelGradient = (() => {
    const border = 0.7; // degrees for separator line (0.4–1.2 feels good)

    const stops = segments.map((_, idx) => {
      const start = idx * slice;
      const end = idx === n - 1 ? 360 : (idx + 1) * slice;

      const color = idx % 2 === 0 ? '#EE2536' : '#FFFFFF';
      const line = 'rgba(0,0,0,0.12)';

      const a = start.toFixed(4);
      const b = (start + border).toFixed(4);
      const c = (end - border).toFixed(4);
      const d = end.toFixed(4);

      // line at start edge, solid slice, line at end edge
      return `${line} ${a}deg ${b}deg, ${color} ${b}deg ${c}deg, ${line} ${c}deg ${d}deg`;
    });

    return `conic-gradient(${stops.join(',')})`;
  })();

  function doSpin() {
    if (spinning) return;

    setWinner(null);
    setSpinning(true);

    if (soundCleanupRef.current) {
      soundCleanupRef.current();
    }
    soundCleanupRef.current = playSpinSound();

    const pickedIdx = weightedPickIndex(PRIZES);
    const picked = segments[pickedIdx];

    const fullRotations = 40 + Math.floor(Math.random() * 3); // 4–6 full rotations
    const jitter = Math.random() * 10 - 5;

    // Current rotation (keep it bounded for nicer math)
    const current = rotationRef.current;
    const currentMod = ((current % 360) + 360) % 360;

    // We want the pointer (top) to land on picked.centerDeg
    // So wheel rotation mod 360 should become (360 - centerDeg)
    const targetMod = (360 - picked.centerDeg + 360) % 360;

    // Smallest forward delta to reach targetMod from currentMod
    const delta = (targetMod - currentMod + 360) % 360;

    const finalDeg = current + fullRotations * 360 + delta + jitter;

    const el = wheelRef.current;
    if (el) {
      el.style.transition = 'none';
      void el.offsetWidth; // force reflow
      el.style.transition = 'transform 3.4s cubic-bezier(0.12, 0.82, 0.2, 1)';
      el.style.transform = `rotate(${finalDeg}deg)`;
    }

    rotationRef.current = finalDeg;

    window.setTimeout(() => {
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
  const rotationRef = useRef(0);

  return (
    <div className="page">
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
                  <span
                    style={{
                      transform: 'rotate(90deg)', // keeps text readable
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              ))}

              <div className="hub" aria-hidden="true">
                SPIN
              </div>
            </div>
          </div>
        </section>

        <aside className="side">
          <button className="primaryBtn" onClick={doSpin} disabled={spinning}>
            {spinning ? 'Spinning…' : 'Spin the Wheel'}
          </button>

          <div className="panel">
            <div className="panelTitle">Result</div>

            {!winner ? (
              <div className="panelBody subtle">
                {spinning ? 'Good luck…' : 'Tap “Spin the Wheel” to start.'}
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
              {PRIZES.map((p, idx) => (
                <div key={`${p.label}-${idx}`} className="listRow">
                  <span>{p.label}</span>
                  <span className="chip">Gift</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel small">
            <div className="panelTitle">Booth tips</div>
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
          Note: No inventory tracking. Outcomes are random based on prize
          weights (if set).
        </span>
      </footer>
    </div>
  );
}
