import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'tii-intro-seen-2026';

// Upward-trend barcode — deterministic
const BARS = Array.from({ length: 28 }, (_, i) => {
  const trend = i / 27;
  const wobble = Math.sin(i * 2.5) * 0.12 + Math.sin(i * 7.1) * 0.06;
  return {
    h: Math.max(4, Math.round(5 + (trend + wobble) * 28)),
    w: i % 5 === 0 ? 3 : i % 2 === 0 ? 2 : 1,
  };
});

const SECTIONS = [
  {
    num: '01', head: 'Before You Fly',
    body: (c) => `Submit your flight form — link in the full guide. Hotel shuttle meets you at YWG arrivals.`,
  },
  {
    num: '02', head: 'Check-In & Venue',
    body: (c) => `First session 12:00 PM · Room check-in 3:00 PM. WiFi: ${c.wifi_text}`,
  },
  {
    num: '03', head: 'Dress Code',
    body: (c) => c.dress_code,
  },
];

/**
 * TiiEnvelopeIntro — first-device scroll card, shown before the main guide.
 *
 * Props
 * ─────
 * onComplete()   called when user taps "Open full guide"
 * tiiData        live row from this_is_it_event_content (passed from ThisIsItInfo
 *                after its query resolves; falls back to FALLBACK while loading)
 */
export default function TiiEnvelopeIntro({ onComplete, tiiData = {} }) {
  const [phase, setPhase] = useState('enter'); // enter → loaded → out
  const secRefs = useRef([]);

  const c = {
    friday_opening_time:     tiiData.friday_opening_time     ?? '3:00 PM',
    monday_checkout_time:    tiiData.monday_checkout_time    ?? 'Mon Morning',
    hotel_name:              tiiData.hotel_name              ?? 'Sandman Winnipeg Airport',
    dress_code:              tiiData.dress_code              ?? 'Formal for most of the weekend.',
    all_white_for:           tiiData.all_white_for           ?? 'Thanksgiving service',
    wifi_text:               tiiData.wifi_text               ?? 'Free, hotel-wide',
    sessions_text:           tiiData.sessions_text           ?? 'Conference Room',
    transport_contact_name:  tiiData.transport_contact_name  ?? 'David Akalue',
    transport_contact_phone: tiiData.transport_contact_phone ?? '+1 (204) 396-6156',
  };

  useEffect(() => {
    const t = setTimeout(() => setPhase('loaded'), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== 'loaded') return;
    secRefs.current.forEach((el, i) => {
      if (!el) return;
      setTimeout(() => el?.classList.add('tii-sec-in'), 480 + i * 130);
    });
  }, [phase]);

  function handleOpen() {
    setPhase('out');
    localStorage.setItem(STORAGE_KEY, '1');
    setTimeout(onComplete, 420);
  }

  const isLoaded = phase === 'loaded';
  const isOut    = phase === 'out';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800;900&display=swap');

        /* ── Outer shell — fixed, handles scroll ─────────────────── */
        .tii-intr-shell {
          position: fixed; inset: 0; z-index: 1000;
          background: #F9F6EF;
          overflow-y: auto; overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          transition: opacity .4s ease;
        }

        /* ── Inner — centers card, contains blobs ─────────────────── */
        .tii-intr-inner {
          position: relative;
          min-height: 100%;
          display: flex; flex-direction: column;
          align-items: center; justify-content: flex-start;
          padding: 24px 16px 56px;
          font-family: 'Inter', sans-serif;
          /* blobs must be absolute children — not fixed — so scroll works */
        }

        /* Subtle warm blobs */
        .tii-bg-blob {
          position: absolute; border-radius: 50%; pointer-events: none; z-index: 0;
          animation: tii-blobDrift var(--dur) ease-in-out var(--del) infinite alternate;
        }
        @keyframes tii-blobDrift {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(var(--mx),var(--my)) scale(1.06); }
        }

        /* ── Card ─────────────────────────────────────────────────── */
        @keyframes tii-cardDrop {
          0%   { opacity:0; transform:translateY(-24px) scale(0.94) rotate(-.3deg); }
          65%  { transform:translateY(4px) scale(1.008) rotate(.08deg); }
          100% { opacity:1; transform:none; }
        }
        .tii-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 380px;
          background: #fff;
          border-radius: 14px;
          border: 1px solid #E7DFCB;
          box-shadow: 0 8px 32px rgba(22,23,23,.15);
          overflow: hidden;
          opacity: 0;
        }
        .tii-card.tii-card-loaded {
          animation: tii-cardDrop .8s cubic-bezier(.22,.61,.36,1) .1s both;
        }

        /* ── Coral header ─────────────────────────────────────────── */
        .tii-ch {
          background: #DD6F51;
          padding: 10px 18px;
          display: flex; justify-content: space-between; align-items: center;
          position: relative; overflow: hidden;
        }
        @keyframes tii-hshine {
          0%  { left:-60%; opacity:0; }
          8%  { opacity:1; }
          55% { left:130%; }
          100%{ left:130%; opacity:0; }
        }
        .tii-ch::after {
          content:''; position:absolute; top:0; bottom:0; width:40%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.14),transparent);
          animation:tii-hshine 3.8s ease-out 1.2s infinite;
        }
        .tii-ch-name {
          font-family:'Anton',sans-serif; font-size:13px;
          color:#fff; letter-spacing:.04em; text-transform:uppercase;
        }
        .tii-ch-type {
          font-size:9px; letter-spacing:.18em; text-transform:uppercase;
          font-weight:700; color:rgba(255,255,255,.75);
        }

        /* ── Logo ─────────────────────────────────────────────────── */
        .tii-logo-wrap {
          display:flex; justify-content:center;
          padding: 14px 20px 4px;
        }
        .tii-logo-img { width:140px; max-width:58%; height:auto; display:block; }

        /* ── Route row ────────────────────────────────────────────── */
        .tii-route-row {
          display:flex; justify-content:space-between;
          align-items:flex-end; gap:6px;
          padding: 12px 18px 10px;
        }
        .tii-city-code {
          font-family:'Anton',sans-serif;
          font-size: clamp(36px, 9.5vw, 52px);
          line-height:1; letter-spacing:.02em; color:#1a1a1a;
        }
        .tii-city-sub { font-size:9px; color:#999; margin-top:3px; letter-spacing:.06em; text-transform:uppercase; }
        .tii-route-mid {
          flex:1; display:flex; flex-direction:column;
          align-items:center; gap:5px; padding:0 6px 6px;
        }
        .tii-route-dates { font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:#bbb; font-weight:700; }

        /* ── Fields ───────────────────────────────────────────────── */
        .tii-fields {
          display:grid; grid-template-columns:repeat(2,1fr);
          gap:8px 14px; border-top:1px solid #eee;
          padding: 9px 18px 12px;
        }
        .tii-field label {
          display:block; font-size:8px; letter-spacing:.12em;
          text-transform:uppercase; color:#aaa; margin-bottom:3px; font-weight:700;
        }
        .tii-field .val { font-weight:700; font-size:12.5px; color:#1a1a1a; line-height:1.3; }

        /* ── Sections ─────────────────────────────────────────────── */
        .tii-secs { border-top:1px solid #eee; padding: 10px 18px 0; }
        .tii-sec {
          display:flex; gap:11px; padding:9px 0;
          border-bottom:1px solid #E7DFCB; align-items:flex-start;
          opacity:0; transform:translateY(8px);
        }
        .tii-sec:last-child { border-bottom:none; }
        .tii-sec.tii-sec-in {
          transition:opacity .4s ease, transform .4s ease;
          opacity:1; transform:none;
        }

        /* Yellow dot — exact .tii-dot from main page */
        @keyframes tii-dotIn {
          0%  { transform:scale(.5); opacity:0; }
          70% { transform:scale(1.15); }
          100%{ transform:scale(1); opacity:1; }
        }
        @keyframes tii-dotPulse {
          0%,100%{ box-shadow:0 0 0 0 rgba(234,198,61,.4); }
          50%    { box-shadow:0 0 0 5px rgba(234,198,61,0); }
        }
        .tii-dot {
          flex-shrink:0; width:28px; height:28px; border-radius:50%;
          background:#EAC63D; color:#161717;
          display:flex; align-items:center; justify-content:center;
          font-family:'Anton',sans-serif; font-size:12px;
          border:1px solid rgba(234,198,61,.4); margin-top:1px;
        }
        .tii-sec.tii-sec-in .tii-dot {
          animation:tii-dotIn .4s cubic-bezier(.34,1.56,.64,1) .08s both,
                    tii-dotPulse 2.8s ease-in-out .55s infinite;
        }
        .tii-sec-head {
          font-size:8.5px; letter-spacing:.12em; text-transform:uppercase;
          color:#aaa; font-weight:700; margin-bottom:3px;
        }
        .tii-sec-body { font-size:12.5px; line-height:1.6; color:#161717; }
        .tii-sec-body strong { font-weight:700; }

        /* ── Stub ─────────────────────────────────────────────────── */
        .tii-stub {
          border-top:1px solid #eee;
          padding: 11px 18px;
          display:flex; justify-content:space-between; align-items:center; gap:10px;
        }
        .tii-live-row {
          display:flex; align-items:center; gap:6px;
          font-size:10px; letter-spacing:.07em; text-transform:uppercase;
          font-weight:800; color:#3aa895;
        }
        @keyframes tii-livePing {
          0%,100%{ box-shadow:0 0 0 0 rgba(58,168,149,.55); }
          50%    { box-shadow:0 0 0 5px rgba(58,168,149,0); }
        }
        .tii-live-dot {
          width:7px; height:7px; border-radius:50%;
          background:#3aa895; flex-shrink:0;
          animation:tii-livePing 2.1s ease-in-out infinite;
        }
        .tii-barcode { display:flex; align-items:flex-end; gap:1px; height:32px; }
        .tii-bar { display:inline-block; background:#1a1a1a; opacity:.8; }

        /* ── CTA ──────────────────────────────────────────────────── */
        .tii-cta { padding: 10px 18px 18px; }
        @keyframes tii-ctaPulse {
          0%,100%{ box-shadow:0 5px 20px rgba(107,18,188,.35); }
          50%    { box-shadow:0 7px 28px rgba(107,18,188,.55); }
        }
        .tii-open-btn {
          display:block; width:100%; padding:13px;
          background:#6B12BC; color:#fff; border:none; border-radius:9px;
          font-family:'Inter',sans-serif; font-size:14px; font-weight:800;
          letter-spacing:.03em; cursor:pointer; text-align:center;
          animation:tii-ctaPulse 2.6s ease-in-out 2s infinite;
          transition:background .2s, transform .15s;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .tii-open-btn:hover  { background:#5a0fa8; transform:translateY(-1px); }
        .tii-open-btn:active { transform:none; }

        /* ── Safe-area bottom padding on iPhone ───────────────────── */
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .tii-intr-inner { padding-bottom: calc(56px + env(safe-area-inset-bottom)); }
        }

        @media (prefers-reduced-motion: reduce) {
          .tii-card { animation:none !important; opacity:1; }
          .tii-bg-blob, .tii-live-dot, .tii-open-btn,
          .tii-sec.tii-sec-in .tii-dot, .tii-ch::after { animation:none !important; }
          .tii-sec.tii-sec-in { transition:none; }
        }
      `}</style>

      {/* Outer scrollable shell */}
      <div
        className="tii-intr-shell"
        style={{ opacity: isOut ? 0 : 1, pointerEvents: isOut ? 'none' : 'auto' }}
        aria-modal="true"
        role="dialog"
        aria-label="This Is It 2026 Prep Guide"
      >
        <div className="tii-intr-inner">

          {/* Background blobs — absolute so they scroll with content */}
          {[
            { x:'8%',  y:'2%',  s:130, c:'rgba(221,111,81,.07)',  mx:'12px',  my:'-8px',  dur:'8s',   del:'0s'   },
            { x:'78%', y:'1%',  s:140, c:'rgba(107,18,188,.05)',  mx:'-12px', my:'10px',  dur:'10s',  del:'1.2s' },
            { x:'12%', y:'62%', s:100, c:'rgba(221,111,81,.07)',  mx:'8px',   my:'-6px',  dur:'9s',   del:'2s'   },
            { x:'72%', y:'60%', s:110, c:'rgba(126,218,195,.06)', mx:'-10px', my:'-10px', dur:'11s',  del:'.5s'  },
          ].map((b, i) => (
            <div key={i} className="tii-bg-blob" style={{
              left:b.x, top:b.y, width:b.s, height:b.s,
              background:`radial-gradient(circle, ${b.c} 0%, transparent 70%)`,
              '--dur':b.dur, '--del':b.del, '--mx':b.mx, '--my':b.my,
            }} />
          ))}

          {/* Card */}
          <div className={`tii-card${isLoaded ? ' tii-card-loaded' : ''}`}>

            {/* Logo */}
            <div className="tii-logo-wrap">
              <img
                className="tii-logo-img"
                src="/this-is-it-logo.png"
                alt="This Is It 2.0"
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            </div>

            {/* Route */}
            <div className="tii-route-row">
              <div>
                <div className="tii-city-code">???</div>
                <div className="tii-city-sub">Your City</div>
              </div>
              <div className="tii-route-mid">
                <svg viewBox="0 0 80 18" xmlns="http://www.w3.org/2000/svg"
                  style={{ width:'100%', height:16, color:'#DD6F51', overflow:'visible' }}>
                  <line x1="0" y1="9" x2="62" y2="9" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 3"/>
                  <polyline points="53,2.5 70,9 53,15.5" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div className="tii-route-dates">Aug 28 – 31, 2026</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div className="tii-city-code">YWG</div>
                <div className="tii-city-sub">Winnipeg, MB</div>
              </div>
            </div>

            {/* Fields — live from DB via tiiData */}
            <div className="tii-fields">
              <div className="tii-field">
                <label>1st Session</label>
                <div className="val">Fri, Aug 28 · 12:00 PM</div>
              </div>
              <div className="tii-field">
                <label>Checkout</label>
                <div className="val">{c.monday_checkout_time}</div>
              </div>
              <div className="tii-field">
                <label>Hotel</label>
                <div className="val">{c.hotel_name}</div>
              </div>
              <div className="tii-field">
                <label>Dress</label>
                <div className="val">Formal</div>
              </div>
            </div>

            {/* Sections */}
            <div className="tii-secs">
              {SECTIONS.map((sec, i) => (
                <div
                  key={sec.num}
                  className="tii-sec"
                  ref={el => secRefs.current[i] = el}
                >
                  <div className="tii-dot">{sec.num}</div>
                  <div>
                    <div className="tii-sec-head">{sec.head}</div>
                    <div className="tii-sec-body">{sec.body(c)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Stub */}
            <div className="tii-stub">
              <div className="tii-live-row">
                <div className="tii-live-dot" />
                Live · Updates as details confirm
              </div>
              <div className="tii-barcode" aria-hidden>
                {BARS.map((bar, i) => (
                  <div key={i} className="tii-bar"
                    style={{ width: bar.w, height: bar.h }} />
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="tii-cta">
              <button className="tii-open-btn" onClick={handleOpen}>
                Open full guide →
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
