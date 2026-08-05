import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'

const BIRTHDAY_DATE = '2026-08-05'

function isBirthdayWindow() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}` === BIRTHDAY_DATE
}

// Confetti uses Nexus brand palette + celebration tones
const CONFETTI_COLORS = [
  '#E8A020', '#C47E0A', '#FDF0D5', // amber family
  '#4C2A92', '#6B4BBE', '#EDE8F8', // purple family
  '#2D8653', '#A7D9BE',             // sage
  '#F06449', '#FEF0ED',             // coral
  '#F472B6', '#FCA5A5',             // rose (festive only)
]
const BALLOON_COLORS = [
  '#E8A020', '#4C2A92', '#2D8653',
  '#F06449', '#6B4BBE', '#C47E0A',
  '#F472B6', '#A78BFA',
]

const CONFETTI = Array.from({ length: 100 }, (_, i) => ({
  id: i,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  left: (i * 1.01) % 100,
  delay: (i * 0.062) % 6.5,
  duration: 3.2 + (i % 9) * 0.38,
  size: 6 + (i % 5),
  rotate: (i * 53) % 360,
  shape: i % 4, // 0=square 1=circle 2=ribbon 3=diamond
  driftX: ((i % 7) - 3) * 38,
}))

const BALLOONS = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  color: BALLOON_COLORS[i % BALLOON_COLORS.length],
  x: 3 + i * 11.5,
  delay: i * 0.42,
  size: 52 + (i % 4) * 11,
  duration: 7.5 + (i % 4) * 1.8,
}))

const KEYFRAMES = `
@keyframes bdayFall {
  0%   { transform: translateY(-20px) rotate(0deg)   translateX(0);                opacity: 1; }
  100% { transform: translateY(108vh) rotate(680deg) translateX(var(--bday-dx,0px)); opacity: 0.3; }
}
@keyframes bdayBalloon {
  0%   { transform: translateY(0);      opacity: 0; }
  7%   { opacity: 1; }
  48%  { transform: translateY(-55vh) rotate(3deg); }
  72%  { transform: translateY(-98vh) rotate(-3deg); }
  93%  { opacity: 0.9; }
  100% { transform: translateY(-150vh); opacity: 0; }
}
@keyframes bdayCardIn {
  0%   { transform: translate(-50%,-50%) scale(0.88);  opacity: 0; }
  60%  { transform: translate(-50%,-50%) scale(1.015); opacity: 1; }
  100% { transform: translate(-50%,-50%) scale(1);     opacity: 1; }
}
@keyframes bdayHeart {
  0%,100% { transform: scale(1); }
  15%     { transform: scale(1.22); }
  30%     { transform: scale(1); }
  45%     { transform: scale(1.12); }
  60%     { transform: scale(1); }
}
@keyframes bdayFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`

function BalloonSvg({ size, color }) {
  return (
    <svg width={size} height={Math.round(size * 1.52)} viewBox="0 0 60 92" fill="none">
      <ellipse cx="30" cy="58" rx="9" ry="2.5" fill="rgba(0,0,0,0.10)" />
      <ellipse cx="30" cy="27" rx="24" ry="26" fill={color} />
      <ellipse cx="23" cy="16" rx="10" ry="8" fill="rgba(255,255,255,0.22)" />
      <ellipse cx="19" cy="12" rx="4.5" ry="3.5" fill="rgba(255,255,255,0.42)" />
      <path d="M26 53 Q30 59 34 53" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M30 59 Q23 69 29 78 Q35 84 29 92" stroke="#C9C0B0" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export default function BirthdayOverlay() {
  const { profile } = useAuth()
  const [visible, setVisible] = useState(false)
  const [cardGone, setCardGone] = useState(false)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'regional_secretary') return
    if (!isBirthdayWindow()) return

    setVisible(true)
  }, [profile])

  if (!visible) return null

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Confetti */}
      {CONFETTI.map(p => (
        <div
          key={p.id}
          style={{
            position: 'fixed',
            top: -28,
            left: `${p.left}%`,
            width: p.shape === 2 ? Math.round(p.size / 2) : p.size,
            height: p.shape === 2 ? p.size * 2.2 : p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === 1 ? '50%' : 2,
            transform: `rotate(${p.shape === 3 ? p.rotate + 45 : p.rotate}deg)`,
            '--bday-dx': `${p.driftX}px`,
            animation: `bdayFall ${p.duration}s ${p.delay}s ease-in both`,
            zIndex: 9996,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Balloons */}
      {BALLOONS.map(b => (
        <div
          key={b.id}
          style={{
            position: 'fixed',
            bottom: -145,
            left: `${b.x}%`,
            animation: `bdayBalloon ${b.duration}s ${b.delay}s ease-in-out both`,
            zIndex: 9997,
            pointerEvents: 'none',
          }}
        >
          <BalloonSvg size={b.size} color={b.color} />
        </div>
      ))}

      {/* Backdrop */}
      {!cardGone && (
        <div
          onClick={() => setCardGone(true)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28,22,16,0.52)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 9998,
            animation: 'bdayFadeIn 0.4s ease both',
          }}
        />
      )}

      {/* Card — Nexus surface + border language */}
      {!cardGone && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(388px, 88vw)',
            background: '#FFFFFF',
            border: '1px solid #E9E4D8',
            borderRadius: 16,
            overflow: 'hidden',
            zIndex: 9999,
            boxShadow: '0 20px 60px rgba(28,22,16,0.18), 0 4px 16px rgba(28,22,16,0.08)',
            animation: 'bdayCardIn 0.5s cubic-bezier(.22,1,.36,1) both',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          {/* Header — Nexus amber → navy purple */}
          <div style={{
            background: 'linear-gradient(140deg, #E8A020 0%, #4C2A92 100%)',
            padding: '32px 28px 24px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 14 }}>🎂</div>
            <div style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.65)',
              marginBottom: 5,
            }}>
              Happy Birthday
            </div>
            <div style={{
              fontSize: 23,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
            }}>
              Pastor Sir
            </div>
          </div>

          {/* Divider line */}
          <div style={{ height: 1, background: '#E9E4D8' }} />

          {/* Body */}
          <div style={{ padding: '22px 26px 20px', background: '#FFFFFF' }}>
            <p style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: 1.8,
              color: '#1C1610',
              textAlign: 'center',
              fontStyle: 'italic',
              letterSpacing: '0.01em',
            }}>
              Thank you Sir for all the investments
              <br />you've made in us.
            </p>
            <p style={{
              margin: '4px 0 0',
              fontSize: 14.5,
              lineHeight: 1.8,
              color: '#7A6F5E',
              textAlign: 'center',
              fontStyle: 'italic',
              letterSpacing: '0.01em',
            }}>
              The Lord gave us the very best.
            </p>

            {/* Divider with heart */}
            <div style={{
              margin: '18px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ flex: 1, height: 1, background: '#E9E4D8' }} />
              <span style={{
                fontSize: 18,
                animation: 'bdayHeart 1.5s ease-in-out infinite',
                display: 'inline-block',
              }}>❤️</span>
              <span style={{ flex: 1, height: 1, background: '#E9E4D8' }} />
            </div>

            <p style={{
              margin: '0 0 18px',
              fontSize: 14.5,
              fontWeight: 600,
              fontStyle: 'italic',
              color: '#1C1610',
              textAlign: 'center',
              letterSpacing: '0.01em',
            }}>
              We love you immensely. 💛
            </p>

            {/* Nexus-style primary button — amber */}
            <button
              onClick={() => setCardGone(true)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 0',
                background: '#E8A020',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.01em',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#C47E0A' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#E8A020' }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </>
  )
}
