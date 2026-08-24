import { useState, useEffect } from 'react';

const STORAGE_KEY = 'tii-intro-seen-2026';

/**
 * TiiEnvelopeIntro — shown once per device on first load of ThisIsItInfo.
 * Renders a full-screen cream overlay with an animated envelope that opens
 * to reveal the info page. Checks localStorage; calls onComplete() when done.
 */
export default function TiiEnvelopeIntro({ onComplete }) {
  const [phase, setPhase] = useState('enter');
  // phases: enter → idle → opening → rising → out

  useEffect(() => {
    // Small delay so fonts load before we make the envelope visible
    const t = setTimeout(() => setPhase('idle'), 450);
    return () => clearTimeout(t);
  }, []);

  function handleOpen() {
    if (phase !== 'idle') return;
    setPhase('opening');
    // Letter starts rising ~300ms after flap begins rotating
    setTimeout(() => setPhase('rising'), 320);
    // Overlay fades out and calls onComplete
    setTimeout(() => {
      setPhase('out');
      localStorage.setItem(STORAGE_KEY, '1');
    }, 1700);
    setTimeout(onComplete, 2150);
  }

  const flapOpen  = phase === 'opening' || phase === 'rising' || phase === 'out';
  const letterUp  = phase === 'rising'  || phase === 'out';
  const fading    = phase === 'out';
  const ready     = phase === 'idle';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700&display=swap');

        .tii-env-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: linear-gradient(155deg, #FBF7EE 0%, #F0E8D8 100%);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 0;
          font-family: 'Inter', sans-serif;
          /* Subtle paper texture via repeating radial-gradient */
          background-image:
            radial-gradient(circle at 20% 30%, rgba(221,111,81,0.04) 0%, transparent 40%),
            radial-gradient(circle at 80% 70%, rgba(107,18,188,0.04) 0%, transparent 40%),
            linear-gradient(155deg, #FBF7EE 0%, #F0E8D8 100%);
        }

        .tii-env-eyebrow {
          font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
          color: #aaa; font-weight: 600; margin: 0 0 28px;
          transition: opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s;
        }

        /* ── Envelope container ─────────────────────────────────────── */
        .tii-env {
          position: relative;
          width: 300px; height: 210px;
          perspective: 800px;
          transition: opacity 0.6s cubic-bezier(.22,.61,.36,1), transform 0.6s cubic-bezier(.22,.61,.36,1);
        }
        @media (max-width: 380px) {
          .tii-env { width: 270px; height: 190px; }
        }

        /* ── Flap (top triangle, rotates away on open) ────────────── */
        .tii-env-flap {
          position: absolute; top: 0; left: 0; width: 100%; height: 140px;
          transform-origin: top center;
          transition: transform 0.7s cubic-bezier(.34,1.0,.64,1);
          backface-visibility: hidden;
          z-index: 4;
        }
        @media (max-width: 380px) { .tii-env-flap { height: 126px; } }
        .tii-env-flap-front {
          position: absolute; inset: 0;
          clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
          background: #DD6F51;
        }
        /* Subtle inner shadow along the fold edge */
        .tii-env-flap-shadow {
          position: absolute; bottom: 0; left: 20%; right: 20%; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(0,0,0,0.1), transparent);
        }
        /* BLW wax seal on flap */
        .tii-env-seal {
          position: absolute;
          bottom: 18px; left: 50%; transform: translateX(-50%);
          width: 36px; height: 36px;
          background: #6B12BC;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px;
          box-shadow: 0 2px 6px rgba(22,23,23,0.2);
          z-index: 5;
          transition: opacity 0.25s ease;
        }

        /* ── Envelope body ─────────────────────────────────────────── */
        .tii-env-body {
          position: absolute; top: 70px; left: 0; right: 0; bottom: 0;
          background: #FFFFFF;
          border: 1px solid #E7DFCB;
          border-radius: 0 0 10px 10px;
          box-shadow: 0 8px 36px rgba(22,23,23,0.14);
          z-index: 2;
          overflow: hidden;
        }
        /* Left fold triangle */
        .tii-env-body::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, #EDE7D8 36%, transparent 36%);
        }
        /* Right fold triangle */
        .tii-env-body::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(225deg, #EDE7D8 36%, transparent 36%);
        }
        /* Bottom fold — separate div since ::after is taken */
        .tii-env-bottom-fold {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background:
            /* bottom V shape */
            linear-gradient(to top right, #E8E1D0 40%, transparent 40%),
            linear-gradient(to top left,  #E8E1D0 40%, transparent 40%);
          clip-path: polygon(0% 100%, 50% 52%, 100% 100%);
        }

        /* ── Letter card ────────────────────────────────────────────── */
        .tii-env-letter {
          position: absolute;
          left: 18px; right: 18px;
          height: 230px;
          bottom: -12px;           /* sits inside envelope body */
          background: #FFFDF8;
          border: 1px solid #EDE8DC;
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(22,23,23,0.08);
          z-index: 3;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 0 20px; gap: 10px;
          /* Letter invisible before opening; fades in as it rises */
          opacity: 0;
          /* default: no translateY — rises when letterUp */
          transition:
            transform 0.85s cubic-bezier(.22,.61,.36,1),
            opacity 0.45s ease;
        }
        .tii-env-letter-logo {
          width: 84px; height: auto; display: block;
        }
        .tii-env-letter-dates {
          font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
          color: #aaa; font-weight: 700; text-align: center;
        }
        .tii-env-letter-title {
          font-family: 'Anton', sans-serif;
          font-size: 16px; letter-spacing: .04em; color: #6B12BC;
          text-align: center; line-height: 1.3;
        }
        .tii-env-letter-divider {
          width: 40px; height: 1px; background: #EDE8DC;
        }
        .tii-env-letter-sub {
          font-size: 11px; color: #bbb; font-weight: 600; text-align: center;
          letter-spacing: .03em;
        }

        /* ── CTA button ─────────────────────────────────────────────── */
        .tii-env-cta {
          margin-top: 38px;
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .tii-env-btn {
          background: #6B12BC; color: #fff;
          border: none; border-radius: 999px;
          padding: 13px 34px;
          font-family: 'Inter', sans-serif;
          font-size: 14px; font-weight: 700; letter-spacing: .03em;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(107,18,188,0.3);
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .tii-env-btn:hover {
          background: #5a0fa8;
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(107,18,188,0.38);
        }
        .tii-env-btn:active { transform: translateY(0); }
        .tii-env-hint {
          margin-top: 14px; font-size: 11px; color: #ccc; font-weight: 500;
          text-align: center;
          transition: opacity 0.4s ease 0.2s;
        }

        /* ── Shimmer on envelope when idle ─────────────────────────── */
        @keyframes tii-env-pulse {
          0%, 100% { box-shadow: 0 8px 36px rgba(22,23,23,0.14); }
          50%       { box-shadow: 0 8px 36px rgba(22,23,23,0.14), 0 0 0 4px rgba(234,198,61,0.18); }
        }
        @keyframes tii-seal-pulse {
          0%, 100% { box-shadow: 0 2px 6px rgba(22,23,23,0.2), 0 0 0 0 rgba(107,18,188,0.3); }
          50%       { box-shadow: 0 2px 6px rgba(22,23,23,0.2), 0 0 0 5px rgba(107,18,188,0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .tii-env-flap, .tii-env-letter, .tii-env-cta, .tii-env-eyebrow {
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <div
        className="tii-env-overlay"
        style={{
          opacity:    fading ? 0   : 1,
          transition: 'opacity 0.5s ease',
          pointerEvents: fading ? 'none' : 'auto',
        }}
      >
        {/* Eyebrow */}
        <p
          className="tii-env-eyebrow"
          style={{
            opacity:   ready || fading || flapOpen ? 1 : 0,
            transform: ready || fading || flapOpen ? 'none' : 'translateY(8px)',
          }}
        >
          BLW Canada Sub-Region
        </p>

        {/* Envelope */}
        <div
          className="tii-env"
          onClick={handleOpen}
          role={ready ? 'button' : undefined}
          aria-label={ready ? 'Open your invitation' : undefined}
          style={{
            cursor:    ready ? 'pointer' : 'default',
            opacity:   phase === 'enter' ? 0   : 1,
            transform: phase === 'enter' ? 'scale(0.88) translateY(14px)' : 'scale(1) translateY(0)',
            /* gentle pulse while idle */
            animation: ready ? 'tii-env-pulse 2.8s ease-in-out infinite' : 'none',
          }}
        >
          {/* Wax seal (on flap, fades when flap opens) */}
          <div
            className="tii-env-seal"
            style={{ opacity: flapOpen ? 0 : 1 }}
            aria-hidden="true"
          >
            ✦
          </div>

          {/* Flap */}
          <div
            className="tii-env-flap"
            style={{
              transform: flapOpen ? 'rotateX(-175deg)' : 'rotateX(0deg)',
            }}
          >
            <div className="tii-env-flap-front" />
            <div className="tii-env-flap-shadow" />
          </div>

          {/* Envelope body */}
          <div className="tii-env-body" aria-hidden="true">
            <div className="tii-env-bottom-fold" />
          </div>

          {/* Letter card — rises out of envelope */}
          <div
            className="tii-env-letter"
            style={{
              opacity:   letterUp ? 1 : 0,
              transform: letterUp ? 'translateY(-195px)' : 'translateY(0)',
            }}
            aria-hidden="true"
          >
            <img
              className="tii-env-letter-logo"
              src="/this-is-it-logo.png"
              alt="This Is It 2.0"
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div className="tii-env-letter-divider" />
            <div className="tii-env-letter-title">Your Invitation</div>
            <div className="tii-env-letter-dates">Winnipeg · Aug 28 – 31, 2026</div>
            <div className="tii-env-letter-sub">Bigger · Bolder · Best for God</div>
          </div>
        </div>

        {/* CTA */}
        <div
          className="tii-env-cta"
          style={{
            opacity:   ready ? 1 : 0,
            transform: ready ? 'translateY(0)' : 'translateY(8px)',
            pointerEvents: ready ? 'auto' : 'none',
          }}
        >
          <button
            className="tii-env-btn"
            onClick={handleOpen}
            aria-label="Open your invitation"
          >
            Open your invitation ✉️
          </button>
          <p className="tii-env-hint">Only shown once on this device</p>
        </div>
      </div>
    </>
  );
}
