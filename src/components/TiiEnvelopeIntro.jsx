import { useState, useEffect } from 'react';

const STORAGE_KEY = 'tii-intro-seen-2026';

// Barcode bars — fixed so render is stable
const BARS = [3,1.5,2,1.5,3,1.5,1.5,2,3,1.5,2,3,1.5,2,1.5,3,1.5,2,1.5,2,3,1.5,3,1.5,2,1.5,3,2,1.5,2,3,1.5,1.5,3,2,1.5];

/**
 * TiiEnvelopeIntro — boarding-pass card that flips open on first device visit.
 * Front cover (coral) → flips away → reveals the boarding-pass body → page loads.
 */
export default function TiiEnvelopeIntro({ onComplete }) {
  const [phase, setPhase] = useState('enter');
  // enter → idle → opening → revealed → out

  useEffect(() => {
    const t = setTimeout(() => setPhase('idle'), 480);
    return () => clearTimeout(t);
  }, []);

  function handleOpen() {
    if (phase !== 'idle') return;
    setPhase('opening');
    // boarding pass content fades in just as cover crosses 90°
    setTimeout(() => setPhase('revealed'), 820);
    // overlay fades after a beat to let them see the pass
    setTimeout(() => {
      setPhase('out');
      localStorage.setItem(STORAGE_KEY, '1');
    }, 2000);
    setTimeout(onComplete, 2460);
  }

  const coverFlipped = ['opening', 'revealed', 'out'].includes(phase);
  const passVisible  = ['revealed', 'out'].includes(phase);
  const fading       = phase === 'out';
  const ready        = phase === 'idle';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap');

        .tii-intr {
          position: fixed; inset: 0; z-index: 1000;
          background: radial-gradient(ellipse at 50% 46%, #FBF7EE 0%, #E8DFCD 100%);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          font-family: 'Inter', sans-serif; overflow: hidden;
        }

        /* Floating background blobs */
        .tii-blob {
          position: absolute; border-radius: 50%; pointer-events: none;
          animation: blobDrift var(--dur) ease-in-out var(--del) infinite alternate;
        }
        @keyframes blobDrift {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(var(--mx),var(--my)) scale(1.1); }
        }

        /* Eyebrow */
        .tii-intr-eye {
          font-size: 10px; letter-spacing: .15em; text-transform: uppercase;
          color: #bbb; font-weight: 700; margin: 0 0 24px;
          transition: opacity .65s ease .25s, transform .65s ease .25s;
        }

        /* ── Pass wrapper ─────────────────────────────────────────── */
        .tii-pass-wrap {
          position: relative; width: 340px;
          perspective: 1100px;
          transition: opacity .65s cubic-bezier(.22,.61,.36,1),
                      transform .65s cubic-bezier(.22,.61,.36,1);
          filter: drop-shadow(0 12px 36px rgba(22,23,23,.18));
        }
        @media (max-width: 370px) { .tii-pass-wrap { width: 308px; } }

        /* idle float */
        @keyframes passFloat {
          0%,100% { filter: drop-shadow(0 12px 36px rgba(22,23,23,.18)); transform: translateY(0); }
          45%     { filter: drop-shadow(0 20px 44px rgba(22,23,23,.12)); transform: translateY(-5px); }
        }
        .tii-pass-wrap.idle { animation: passFloat 4.2s ease-in-out infinite; }
        .tii-pass-wrap.idle:hover { animation: none; filter: drop-shadow(0 18px 44px rgba(22,23,23,.22)); }

        /* ── Cover card (coral, flips away) ──────────────────────── */
        .tii-cover {
          position: absolute; top: 0; left: 0; right: 0; height: 192px;
          border-radius: 12px 12px 0 0;
          background: linear-gradient(160deg, #E87A60 0%, #DD6F51 50%, #C06040 100%);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 10px; z-index: 4;
          transform-origin: bottom center;
          transition: transform .88s cubic-bezier(.34,1.0,.64,1);
          backface-visibility: hidden;
          cursor: pointer;
          overflow: hidden;
        }
        /* subtle paper texture lines on cover */
        .tii-cover::before {
          content: '';
          position: absolute; inset: 0;
          background: repeating-linear-gradient(
            -45deg, transparent 0px, transparent 18px,
            rgba(255,255,255,0.03) 18px, rgba(255,255,255,0.03) 19px
          );
        }
        /* shine line sweeps across on idle → catches eye */
        @keyframes coverShine {
          0%   { left: -80%; opacity: 0; }
          8%   { opacity: 1; }
          55%  { left: 120%; opacity: .6; }
          100% { left: 120%; opacity: 0; }
        }
        .tii-cover-shine {
          position: absolute; top: 0; bottom: 0; width: 40%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.15), transparent);
          animation: coverShine 3.6s ease-out 1.2s infinite;
          pointer-events: none;
        }
        .tii-cover-logo { width: 86px; height: auto; position: relative; z-index: 1; }
        .tii-cover-label {
          font-family: 'Anton', sans-serif;
          font-size: 14px; letter-spacing: .12em; color: rgba(255,255,255,.85);
          text-transform: uppercase; position: relative; z-index: 1;
        }
        .tii-cover-dates {
          font-size: 10px; letter-spacing: .1em; color: rgba(255,255,255,.55);
          font-weight: 700; position: relative; z-index: 1;
          text-transform: uppercase;
        }
        /* "tap to open" indicator */
        .tii-cover-tap {
          position: relative; z-index: 1;
          margin-top: 4px;
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; color: rgba(255,255,255,.65); font-weight: 600;
        }
        @keyframes tapArrow { 0%,100%{transform:translateX(0)} 50%{transform:translateX(4px)} }
        .tii-cover-tap svg { animation: tapArrow 1.4s ease-in-out infinite; }

        /* ── Boarding pass body (behind cover, revealed on flip) ─── */
        .tii-pass-body {
          height: 192px;
          background: #fff;
          border-radius: 12px 12px 0 0;
          border: 1px solid #E2D8C5; border-bottom: none;
          overflow: hidden;
          transition: opacity .32s ease;
        }
        /* Coral header strip */
        .tii-pass-header {
          background: #DD6F51;
          padding: 9px 18px;
          display: flex; justify-content: space-between; align-items: center;
        }
        .tii-pass-airline {
          font-family: 'Anton', sans-serif; font-size: 13px;
          color: #fff; letter-spacing: .06em; text-transform: uppercase;
        }
        .tii-pass-bp {
          font-size: 9px; letter-spacing: .18em; color: rgba(255,255,255,.7);
          text-transform: uppercase; font-weight: 700;
        }
        /* Route row */
        .tii-pass-route {
          display: flex; justify-content: space-between; align-items: flex-end;
          padding: 14px 18px 10px;
        }
        .tii-pass-city {
          font-family: 'Anton', sans-serif;
          font-size: clamp(34px, 10vw, 44px); line-height: 1; color: #1a1a1a;
          letter-spacing: .02em;
        }
        .tii-pass-city-sub { font-size: 9px; color: #bbb; letter-spacing: .08em; text-transform: uppercase; margin-top: 3px; }
        .tii-pass-mid {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; gap: 5px; padding: 0 10px 6px;
        }
        .tii-pass-duration { font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: #bbb; font-weight: 700; }
        /* Fields grid */
        .tii-pass-fields {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px 14px; padding: 8px 18px 0;
          border-top: 1px solid #eee;
        }
        .tii-pass-field label {
          display: block; font-size: 8px; letter-spacing: .14em;
          text-transform: uppercase; color: #bbb; margin-bottom: 3px; font-weight: 700;
        }
        .tii-pass-field .val { font-weight: 700; font-size: 12px; color: #1a1a1a; line-height: 1.3; }

        /* ── Perforation / tear-off line ─────────────────────────── */
        .tii-perf {
          position: relative;
          border-top: 2px dashed #ddd;
          background: #fff;
        }
        .tii-perf-notch {
          position: absolute; top: -11px;
          width: 22px; height: 22px; border-radius: 50%;
          background: radial-gradient(ellipse at 50% 46%, #EAE0CC, #E0D4BE);
          border: 1px solid #D8CDB8;
          box-shadow: inset 0 1px 2px rgba(0,0,0,.06);
        }

        /* ── Stub ────────────────────────────────────────────────── */
        .tii-stub {
          background: #fff;
          border: 1px solid #E2D8C5; border-top: none;
          border-radius: 0 0 12px 12px;
          padding: 13px 18px;
          display: flex; justify-content: space-between; align-items: center; gap: 12px;
        }
        .tii-stub-left { display: flex; flex-direction: column; gap: 4px; }
        .tii-live-row {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 700; color: #2a8f7a; letter-spacing: .02em;
        }
        .tii-live-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #3aa895; flex-shrink: 0;
        }
        @keyframes livePing {
          0%,100% { box-shadow: 0 0 0 0 rgba(58,168,149,.5); }
          50%      { box-shadow: 0 0 0 5px rgba(58,168,149,0); }
        }
        .tii-live-dot { animation: livePing 2.2s ease-in-out infinite; }
        .tii-stub-code {
          font-size: 9px; color: #ccc; letter-spacing: .1em;
          text-transform: uppercase; font-family: monospace;
        }
        .tii-barcode { display: flex; align-items: flex-end; gap: 1.5px; height: 36px; }
        .tii-bar { display: inline-block; background: #1a1a1a; }

        /* ── CTA block ────────────────────────────────────────────── */
        .tii-cta {
          margin-top: 30px;
          display: flex; flex-direction: column; align-items: center; gap: 13px;
          transition: opacity .4s ease, transform .4s ease;
        }
        .tii-cta-btn {
          background: linear-gradient(135deg, #7B1ED4, #6B12BC, #5a0fa8);
          color: #fff; border: none; border-radius: 999px;
          padding: 13px 34px;
          font-family: 'Inter', sans-serif;
          font-size: 14px; font-weight: 800; letter-spacing: .04em; cursor: pointer;
          box-shadow: 0 6px 22px rgba(107,18,188,.32), 0 1px 0 rgba(255,255,255,.1) inset;
          transition: transform .18s, box-shadow .18s;
        }
        .tii-cta-btn:hover  { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(107,18,188,.4), 0 1px 0 rgba(255,255,255,.1) inset; }
        .tii-cta-btn:active { transform: translateY(0); }
        .tii-cta-note {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          text-align: center;
        }
        .tii-cta-note-top {
          display: flex; align-items: center; gap: 7px;
          font-size: 12px; font-weight: 700; color: #3aa895;
        }
        .tii-cta-note-sub {
          font-size: 11px; color: #bbb; font-weight: 500;
          max-width: 264px; line-height: 1.55;
        }

        @media (prefers-reduced-motion: reduce) {
          .tii-blob,.tii-pass-wrap.idle,.tii-live-dot,.tii-cover-shine,.tii-cover-tap svg { animation: none !important; }
          .tii-cover,.tii-pass-body,.tii-cta,.tii-intr-eye { transition-duration: .01ms !important; }
        }
      `}</style>

      <div
        className="tii-intr"
        style={{
          opacity:       fading ? 0 : 1,
          transition:    'opacity .48s ease',
          pointerEvents: fading ? 'none' : 'auto',
        }}
      >
        {/* Background blobs */}
        {[
          { x:'9%',  y:'14%', s:140, c:'rgba(234,198,61,0.09)',  mx:'14px',  my:'-10px', dur:'8s',   del:'0s'   },
          { x:'80%', y:'8%',  s:160, c:'rgba(107,18,188,0.07)',  mx:'-14px', my:'12px',  dur:'10s',  del:'1.2s' },
          { x:'16%', y:'73%', s:110, c:'rgba(221,111,81,0.09)',  mx:'10px',  my:'-8px',  dur:'9s',   del:'2s'   },
          { x:'73%', y:'68%', s:130, c:'rgba(126,218,195,0.09)', mx:'-12px', my:'-12px', dur:'11s',  del:'.5s'  },
          { x:'88%', y:'42%', s:80,  c:'rgba(221,111,81,0.07)',  mx:'-8px',  my:'10px',  dur:'8.5s', del:'1.5s' },
        ].map((b, i) => (
          <div key={i} className="tii-blob" style={{
            left: b.x, top: b.y, width: b.s, height: b.s,
            background: `radial-gradient(circle, ${b.c} 0%, transparent 70%)`,
            '--dur': b.dur, '--del': b.del, '--mx': b.mx, '--my': b.my,
          }} />
        ))}

        {/* Eyebrow */}
        <p className="tii-intr-eye" style={{
          opacity:   phase === 'enter' ? 0 : 1,
          transform: phase === 'enter' ? 'translateY(10px)' : 'none',
        }}>
          BLW Canada Sub-Region · 2026
        </p>

        {/* ── Boarding pass ──────────────────────────────────────── */}
        <div
          className={`tii-pass-wrap${ready ? ' idle' : ''}`}
          style={{
            opacity:   phase === 'enter' ? 0 : 1,
            transform: phase === 'enter' ? 'translateY(-20px) scale(0.88)' : 'none',
            ...(coverFlipped ? { animation: 'none', filter: 'none' } : {}),
          }}
        >
          {/* Layer 1: Boarding pass body (revealed when cover flips) */}
          <div className="tii-pass-body" style={{ opacity: passVisible ? 1 : 0 }}>
            {/* Header */}
            <div className="tii-pass-header">
              <span className="tii-pass-airline">BLW Canada · This Is It</span>
              <span className="tii-pass-bp">Prep Guide</span>
            </div>

            {/* Route row */}
            <div className="tii-pass-route">
              <div>
                <div className="tii-pass-city">???</div>
                <div className="tii-pass-city-sub">Your City</div>
              </div>
              <div className="tii-pass-mid">
                <svg viewBox="0 0 80 18" xmlns="http://www.w3.org/2000/svg"
                  style={{ width: '100%', height: 18, color: '#DD6F51', overflow: 'visible' }}>
                  <line x1="0" y1="9" x2="62" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 3"/>
                  <polyline points="53,2.5 70,9 53,15.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div className="tii-pass-duration">Aug 28 – 31</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tii-pass-city">YWG</div>
                <div className="tii-pass-city-sub">Winnipeg, MB</div>
              </div>
            </div>

            {/* Fields */}
            <div className="tii-pass-fields">
              <div className="tii-pass-field">
                <label>Opens</label>
                <div className="val">Fri 6:00 PM</div>
              </div>
              <div className="tii-pass-field">
                <label>Hotel</label>
                <div className="val">Sandman Airport</div>
              </div>
            </div>
          </div>

          {/* Layer 2: Cover (coral, flips away on tap) */}
          <div
            className="tii-cover"
            onClick={handleOpen}
            role="button"
            aria-label="Open your guide"
            style={{ transform: coverFlipped ? 'rotateX(-176deg)' : 'rotateX(0deg)' }}
          >
            <div className="tii-cover-shine" aria-hidden />
            <img
              className="tii-cover-logo"
              src="/this-is-it-logo.png"
              alt="This Is It"
              style={{ filter: 'brightness(0) invert(1) drop-shadow(0 2px 6px rgba(0,0,0,0.3))' }}
              onError={e => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextSibling.style.display = 'block';
              }}
            />
            <div style={{ display: 'none', fontFamily: 'Anton', fontSize: 22, color: '#fff', letterSpacing: '.04em' }}>
              THIS IS IT
            </div>
            <div className="tii-cover-label">Your Prep Guide</div>
            <div className="tii-cover-dates">Winnipeg · Aug 28 – 31, 2026</div>
            {ready && (
              <div className="tii-cover-tap" aria-hidden>
                Tap to open
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8M7 3l3 3-3 3" stroke="rgba(255,255,255,.65)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </div>

          {/* Perforation / fold line */}
          <div className="tii-perf">
            <div className="tii-perf-notch" style={{ left: -11 }} />
            <div className="tii-perf-notch" style={{ right: -11 }} />
          </div>

          {/* Stub */}
          <div className="tii-stub">
            <div className="tii-stub-left">
              <div className="tii-live-row">
                <div className="tii-live-dot" />
                Updated daily — details still confirming
              </div>
              <div className="tii-stub-code">TII 2.0 · 2026 · BLW CAN · YWG</div>
            </div>
            <div className="tii-barcode" aria-hidden>
              {BARS.map((w, i) => (
                <div key={i} className="tii-bar" style={{
                  width: w, height: `${10 + Math.round((i / (BARS.length - 1)) * 26)}px`,
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* ── CTA ───────────────────────────────────────────────────── */}
        <div className="tii-cta" style={{
          opacity:       ready ? 1 : 0,
          transform:     ready ? 'translateY(0)' : 'translateY(10px)',
          pointerEvents: ready ? 'auto' : 'none',
        }}>
          <button
            className="tii-cta-btn"
            onClick={handleOpen}
            aria-label="Open your guide"
          >
            Open your guide ✈
          </button>
          <div className="tii-cta-note">
            <div className="tii-cta-note-top">
              <div className="tii-live-dot" style={{ width: 7, height: 7 }} />
              Live page · Details confirm daily
            </div>
            <div className="tii-cta-note-sub">
              Check back before you fly and throughout the weekend —
              schedule, meals &amp; logistics keep updating as they're confirmed.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
