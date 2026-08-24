import { useState, useEffect } from 'react';

const STORAGE_KEY = 'tii-intro-seen-2026';

/* ── Confetti particles emitted on open ── */
const CONFETTI = [
  { tx: '0px',   ty: '-60px', c: '#EAC63D', s: 9,  d: 0   },
  { tx: '34px',  ty: '-46px', c: '#DD6F51', s: 6,  d: 22  },
  { tx: '58px',  ty: '-12px', c: '#7EDAC3', s: 8,  d: 45  },
  { tx: '50px',  ty: '26px',  c: '#6B12BC', s: 5,  d: 68  },
  { tx: '24px',  ty: '56px',  c: '#EAC63D', s: 7,  d: 90  },
  { tx: '-24px', ty: '56px',  c: '#DD6F51', s: 5,  d: 110 },
  { tx: '-50px', ty: '26px',  c: '#7EDAC3', s: 8,  d: 90  },
  { tx: '-58px', ty: '-12px', c: '#EAC63D', s: 6,  d: 68  },
  { tx: '-34px', ty: '-46px', c: '#6B12BC', s: 7,  d: 45  },
  { tx: '18px',  ty: '-72px', c: '#DD6F51', s: 5,  d: 34  },
  { tx: '-18px', ty: '-72px', c: '#7EDAC3', s: 5,  d: 56  },
  { tx: '70px',  ty: '-32px', c: '#EAC63D', s: 4,  d: 78  },
  { tx: '-70px', ty: '-32px', c: '#6B12BC', s: 6,  d: 100 },
];

export default function TiiEnvelopeIntro({ onComplete }) {
  const [phase, setPhase] = useState('enter');
  // enter → idle → opening → burst → rising → out

  useEffect(() => {
    const t = setTimeout(() => setPhase('idle'), 500);
    return () => clearTimeout(t);
  }, []);

  function handleOpen() {
    if (phase !== 'idle') return;
    setPhase('opening');
    setTimeout(() => setPhase('burst'), 360);
    setTimeout(() => setPhase('rising'), 440);
    setTimeout(() => {
      setPhase('out');
      localStorage.setItem(STORAGE_KEY, '1');
    }, 1900);
    setTimeout(onComplete, 2350);
  }

  const flapOpen  = ['opening','burst','rising','out'].includes(phase);
  const showBurst = ['burst','rising','out'].includes(phase);
  const letterUp  = ['rising','out'].includes(phase);
  const fading    = phase === 'out';
  const ready     = phase === 'idle';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap');

        /* ── Overlay ──────────────────────────────────────────────── */
        .tii-intr {
          position: fixed; inset: 0; z-index: 1000;
          background: radial-gradient(ellipse at 50% 44%, #FBF7EE 0%, #EAE0CC 100%);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          font-family: 'Inter', sans-serif;
          overflow: hidden;
        }

        /* ── Floating background blobs ───────────────────────────── */
        .tii-blob {
          position: absolute; border-radius: 50%;
          pointer-events: none; will-change: transform;
          animation: blobDrift var(--dur) ease-in-out var(--del) infinite alternate;
        }
        @keyframes blobDrift {
          from { transform: translate(0, 0) scale(1);   }
          to   { transform: translate(var(--mx), var(--my)) scale(1.08); }
        }

        /* ── Eyebrow ─────────────────────────────────────────────── */
        .tii-intr-eyebrow {
          font-size: 10px; letter-spacing: .15em; text-transform: uppercase;
          color: #bbb; font-weight: 700; margin: 0 0 26px;
          transition: opacity 0.7s ease 0.3s, transform 0.7s ease 0.3s;
        }

        /* ── Envelope container ──────────────────────────────────── */
        .tii-env-wrap {
          position: relative;
          width: 318px; height: 222px;
          perspective: 900px;
          cursor: pointer;
          transition:
            opacity   0.7s cubic-bezier(.22,.61,.36,1),
            transform 0.7s cubic-bezier(.22,.61,.36,1);
        }
        @media (max-width: 360px) { .tii-env-wrap { width: 285px; height: 200px; } }

        /* idle gentle float */
        @keyframes envFloat {
          0%,100% { transform: translateY(0) rotate(0deg);   filter: drop-shadow(0 12px 32px rgba(22,23,23,.16)); }
          40%     { transform: translateY(-5px) rotate(.4deg); filter: drop-shadow(0 18px 40px rgba(22,23,23,.11)); }
          70%     { transform: translateY(-3px) rotate(-.3deg);filter: drop-shadow(0 16px 36px rgba(22,23,23,.13)); }
        }
        .tii-env-wrap.idle { animation: envFloat 4.5s ease-in-out infinite; }

        /* ── Flap ─────────────────────────────────────────────────── */
        .tii-flap {
          position: absolute; top: 0; left: 0; width: 100%; height: 148px;
          transform-origin: top center;
          transition: transform 0.72s cubic-bezier(.34,1.05,.64,1);
          backface-visibility: hidden;
          z-index: 4;
        }
        .tii-flap-face {
          position: absolute; inset: 0;
          clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
          background: linear-gradient(170deg, #E87A60 0%, #DD6F51 45%, #C96042 100%);
        }
        /* shine sweep on entry */
        @keyframes flapShine {
          0%   { left: -60%; opacity: 0; }
          10%  { opacity: 1; }
          60%  { left: 120%; opacity: .7; }
          100% { left: 120%; opacity: 0; }
        }
        .tii-flap-shine {
          position: absolute; top: 0; bottom: 0; width: 30%;
          clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);
          animation: flapShine 1.4s ease-out 0.7s both;
          pointer-events: none;
        }
        /* crease shadow at fold line */
        .tii-flap-crease {
          position: absolute; bottom: 0; left: 15%; right: 15%; height: 3px;
          background: linear-gradient(90deg, transparent, rgba(0,0,0,0.13) 30%, rgba(0,0,0,0.13) 70%, transparent);
        }

        /* ── Wax seal ─────────────────────────────────────────────── */
        .tii-seal {
          position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%);
          width: 44px; height: 44px; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #7d25c9, #5a0fa8 55%, #3d0772);
          border: 2.5px solid rgba(255,255,255,0.28);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; color: rgba(255,255,255,0.9);
          box-shadow: 0 3px 10px rgba(22,23,23,0.28), inset 0 1px 0 rgba(255,255,255,0.15);
          z-index: 5;
          transition: opacity 0.22s ease, transform 0.22s ease;
          user-select: none;
        }
        @keyframes sealPulse {
          0%,100% { box-shadow: 0 3px 10px rgba(22,23,23,.28), 0 0 0 0 rgba(107,18,188,.4); }
          55%     { box-shadow: 0 3px 10px rgba(22,23,23,.28), 0 0 0 6px rgba(107,18,188,0); }
        }
        .tii-seal.idle { animation: sealPulse 2.6s ease-in-out infinite; }

        /* ── Envelope body ────────────────────────────────────────── */
        .tii-env-body {
          position: absolute; top: 74px; left: 0; right: 0; bottom: 0;
          background: #FEFCF8;
          border: 1px solid #E2D8C5;
          border-radius: 0 0 12px 12px;
          z-index: 2;
          overflow: hidden;
          box-shadow:
            0 2px 0 rgba(255,255,255,0.9) inset,
            0 12px 40px rgba(22,23,23,0.15);
        }
        /* top crease line where flap meets body */
        .tii-env-body::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(0,0,0,0.07) 20%, rgba(0,0,0,0.07) 80%, transparent);
        }
        /* left paper fold */
        .tii-fold-left {
          position: absolute; inset: 0;
          clip-path: polygon(0% 0%, 50% 48%, 0% 100%);
          background: linear-gradient(135deg, #EDE5D2 0%, #E4DBCA 100%);
        }
        /* right paper fold */
        .tii-fold-right {
          position: absolute; inset: 0;
          clip-path: polygon(100% 0%, 50% 48%, 100% 100%);
          background: linear-gradient(225deg, #EDE5D2 0%, #E4DBCA 100%);
        }
        /* bottom V fold */
        .tii-fold-bottom {
          position: absolute; inset: 0;
          clip-path: polygon(0% 100%, 50% 54%, 100% 100%);
          background: linear-gradient(0deg, #E4DBCA 0%, #EDE5D2 100%);
        }
        /* fold crease lines (thin dark edges between fold triangles) */
        .tii-fold-crease-l {
          position: absolute; inset: 0;
          clip-path: polygon(0% 0%, 1.5px 0%, 50% 48%, 0% 100%);
          background: rgba(0,0,0,0.06);
        }
        .tii-fold-crease-r {
          position: absolute; inset: 0;
          clip-path: polygon(100% 0%, calc(100% - 1.5px) 0%, 50% 48%, 100% 100%);
          background: rgba(0,0,0,0.06);
        }

        /* ── Letter card ──────────────────────────────────────────── */
        .tii-letter {
          position: absolute;
          left: 20px; right: 20px;
          height: 244px;
          bottom: -16px;
          background: #FFFEF9;
          border: 1px solid #E8E0D0;
          border-radius: 10px;
          z-index: 3;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 0 22px;
          gap: 0;
          transition: transform 0.9s cubic-bezier(.22,.61,.36,1), opacity 0.4s ease;
          box-shadow:
            0 1px 0 rgba(255,255,255,1) inset,
            0 6px 24px rgba(22,23,23,0.09);
        }
        /* top accent line on letter (coral) */
        .tii-letter::before {
          content: '';
          position: absolute; top: 0; left: 30px; right: 30px; height: 3px;
          background: linear-gradient(90deg, transparent, #DD6F51, transparent);
          border-radius: 0 0 2px 2px;
        }

        .tii-letter-logo {
          width: 80px; height: auto; margin-bottom: 10px;
        }
        .tii-letter-title {
          font-family: 'Anton', sans-serif;
          font-size: 19px; letter-spacing: .04em;
          color: #6B12BC; line-height: 1.15;
          text-align: center; margin: 0 0 4px;
        }
        .tii-letter-tagline {
          font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
          color: #bbb; font-weight: 700; text-align: center; margin: 0 0 12px;
        }
        .tii-letter-divider {
          width: 44px; height: 1px;
          background: linear-gradient(90deg, transparent, #E8E0D0, transparent);
          margin-bottom: 12px;
        }
        .tii-letter-meta {
          display: flex; gap: 14px; align-items: center; margin-bottom: 12px;
        }
        .tii-letter-meta-item {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
        }
        .tii-letter-meta-label {
          font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase;
          color: #ccc; font-weight: 700;
        }
        .tii-letter-meta-value {
          font-size: 12px; font-weight: 700; color: #2D2A22;
        }
        .tii-letter-meta-sep {
          width: 1px; height: 28px; background: #EDE8DC;
        }

        /* ── Live badge ───────────────────────────────────────────── */
        .tii-live-badge {
          display: flex; align-items: center; gap: 6px;
          background: rgba(126,218,195,0.12);
          border: 1px solid rgba(126,218,195,0.35);
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 11px; font-weight: 700; color: #2a8f7a;
          letter-spacing: .03em;
        }
        .tii-live-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #3aa895;
          flex-shrink: 0;
        }
        @keyframes livePing {
          0%,100% { box-shadow: 0 0 0 0 rgba(58,168,149,.5); }
          50%      { box-shadow: 0 0 0 4px rgba(58,168,149,0); }
        }
        .tii-live-dot { animation: livePing 2s ease-in-out infinite; }

        /* ── Confetti burst ───────────────────────────────────────── */
        @keyframes confettiBurst {
          0%   { transform: translate(-50%,-50%) translate(0,0) scale(1);    opacity: 1; }
          70%  { opacity: .8; }
          100% { transform: translate(-50%,-50%) translate(var(--tx),var(--ty)) scale(0); opacity: 0; }
        }
        .tii-conf {
          position: absolute; border-radius: 50%;
          top: 20px; left: 50%;
          transform: translate(-50%,-50%);
          pointer-events: none; z-index: 10;
          animation: confettiBurst 0.7s cubic-bezier(.36,.07,.19,.97) both;
        }

        /* ── CTA block ────────────────────────────────────────────── */
        .tii-intr-cta {
          margin-top: 34px;
          display: flex; flex-direction: column; align-items: center; gap: 14px;
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .tii-intr-btn {
          background: linear-gradient(135deg, #7B1ED4 0%, #6B12BC 60%, #5a0fa8 100%);
          color: #fff; border: none; border-radius: 999px;
          padding: 14px 36px;
          font-family: 'Inter', sans-serif;
          font-size: 14px; font-weight: 800; letter-spacing: .04em;
          cursor: pointer;
          box-shadow: 0 6px 24px rgba(107,18,188,0.35), 0 1px 0 rgba(255,255,255,0.12) inset;
          transition: transform 0.18s, box-shadow 0.18s;
        }
        .tii-intr-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(107,18,188,0.42), 0 1px 0 rgba(255,255,255,0.12) inset;
        }
        .tii-intr-btn:active { transform: translateY(0); }

        /* "page updates live" note */
        .tii-intr-live-note {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          text-align: center;
        }
        .tii-intr-live-note-top {
          display: flex; align-items: center; gap: 7px;
          font-size: 12px; font-weight: 700; color: #3aa895; letter-spacing: .02em;
        }
        .tii-intr-live-note-sub {
          font-size: 11px; color: #bbb; font-weight: 500; max-width: 260px; line-height: 1.5;
        }

        @media (prefers-reduced-motion: reduce) {
          .tii-blob, .tii-env-wrap.idle, .tii-seal.idle,
          .tii-live-dot, .tii-flap-shine { animation: none !important; }
          .tii-flap, .tii-letter, .tii-intr-cta, .tii-intr-eyebrow {
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* ── Overlay ──────────────────────────────────────────────────── */}
      <div
        className="tii-intr"
        style={{
          opacity:    fading ? 0 : 1,
          transition: 'opacity 0.48s ease',
          pointerEvents: fading ? 'none' : 'auto',
        }}
      >

        {/* Background floating blobs */}
        {[
          { x:'10%',  y:'15%', size:130, c:'rgba(234,198,61,0.09)',  mx:'12px',  my:'-10px', dur:'8s',  del:'0s'   },
          { x:'78%',  y:'8%',  size:160, c:'rgba(107,18,188,0.07)',  mx:'-14px', my:'12px',  dur:'10s', del:'1.2s' },
          { x:'18%',  y:'72%', size:110, c:'rgba(221,111,81,0.09)',  mx:'10px',  my:'-8px',  dur:'9s',  del:'2s'   },
          { x:'72%',  y:'70%', size:140, c:'rgba(126,218,195,0.09)', mx:'-12px', my:'-14px', dur:'11s', del:'0.5s' },
          { x:'48%',  y:'88%', size:90,  c:'rgba(234,198,61,0.07)',  mx:'8px',   my:'-10px', dur:'7s',  del:'3s'   },
          { x:'88%',  y:'44%', size:80,  c:'rgba(221,111,81,0.07)',  mx:'-8px',  my:'10px',  dur:'8.5s',del:'1.5s' },
        ].map((b, i) => (
          <div
            key={i}
            className="tii-blob"
            style={{
              left: b.x, top: b.y,
              width: b.size, height: b.size,
              background: `radial-gradient(circle, ${b.c} 0%, transparent 70%)`,
              '--dur': b.dur, '--del': b.del,
              '--mx': b.mx,   '--my': b.my,
            }}
          />
        ))}

        {/* Eyebrow */}
        <p
          className="tii-intr-eyebrow"
          style={{
            opacity:   phase === 'enter' ? 0 : 1,
            transform: phase === 'enter' ? 'translateY(10px)' : 'none',
          }}
        >
          BLW Canada Sub-Region · 2026
        </p>

        {/* ── Envelope ──────────────────────────────────────────────── */}
        <div
          className={`tii-env-wrap${ready ? ' idle' : ''}`}
          onClick={handleOpen}
          role={ready ? 'button' : undefined}
          aria-label={ready ? 'Open your invitation' : undefined}
          style={{
            opacity:   phase === 'enter' ? 0 : 1,
            /* drop-in: starts above + smaller, spring-bounces into place */
            transform: phase === 'enter'
              ? 'translateY(-24px) scale(0.86)'
              : 'translateY(0) scale(1)',
            /* pause idle animation during opening so transform doesn't fight */
            ...(flapOpen ? { animation: 'none', filter: 'none' } : {}),
          }}
        >
          {/* Wax seal — sits on flap, fades on open */}
          <div
            className={`tii-seal${ready ? ' idle' : ''}`}
            style={{ opacity: flapOpen ? 0 : 1, transform: flapOpen ? 'scale(0.6)' : 'translateX(-50%)' }}
            aria-hidden
          >
            ✦
          </div>

          {/* Flap */}
          <div
            className="tii-flap"
            style={{ transform: flapOpen ? 'rotateX(-176deg)' : 'rotateX(0deg)' }}
          >
            <div className="tii-flap-face" />
            <div className="tii-flap-shine" />
            <div className="tii-flap-crease" />
          </div>

          {/* Envelope body */}
          <div className="tii-env-body" aria-hidden>
            <div className="tii-fold-left"   />
            <div className="tii-fold-right"  />
            <div className="tii-fold-bottom" />
            <div className="tii-fold-crease-l" />
            <div className="tii-fold-crease-r" />
          </div>

          {/* Confetti burst */}
          {showBurst && CONFETTI.map((c, i) => (
            <div
              key={i}
              className="tii-conf"
              style={{
                width: c.s, height: c.s,
                background: c.c,
                '--tx': c.tx, '--ty': c.ty,
                animationDelay: `${c.d}ms`,
              }}
            />
          ))}

          {/* Letter card — rises out */}
          <div
            className="tii-letter"
            style={{
              opacity:   letterUp ? 1 : 0,
              transform: letterUp ? 'translateY(-208px)' : 'translateY(0)',
            }}
            aria-hidden
          >
            <img
              className="tii-letter-logo"
              src="/this-is-it-logo.png"
              alt="This Is It"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
            <div className="tii-letter-title">THIS IS IT 2026</div>
            <div className="tii-letter-tagline">Bigger · Bolder · Best for God</div>
            <div className="tii-letter-divider" />
            <div className="tii-letter-meta">
              <div className="tii-letter-meta-item">
                <div className="tii-letter-meta-label">📍 Venue</div>
                <div className="tii-letter-meta-value">Winnipeg, MB</div>
              </div>
              <div className="tii-letter-meta-sep" />
              <div className="tii-letter-meta-item">
                <div className="tii-letter-meta-label">✈ Dates</div>
                <div className="tii-letter-meta-value">Aug 28–31</div>
              </div>
            </div>
            <div className="tii-live-badge">
              <div className="tii-live-dot" />
              Updated daily · Details still confirming
            </div>
          </div>
        </div>

        {/* ── CTA ───────────────────────────────────────────────────── */}
        <div
          className="tii-intr-cta"
          style={{
            opacity:      ready ? 1 : 0,
            transform:    ready ? 'translateY(0)' : 'translateY(10px)',
            pointerEvents: ready ? 'auto' : 'none',
          }}
        >
          <button
            className="tii-intr-btn"
            onClick={handleOpen}
            aria-label="Open your invitation"
          >
            Open your invitation ✉️
          </button>

          {/* Live updates notice */}
          <div className="tii-intr-live-note">
            <div className="tii-intr-live-note-top">
              <div className="tii-live-dot" style={{ width: 7, height: 7 }} />
              Live page — details confirm daily
            </div>
            <div className="tii-intr-live-note-sub">
              Check back before you fly and throughout the weekend —
              schedule, meals, and logistics update as they're confirmed.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
