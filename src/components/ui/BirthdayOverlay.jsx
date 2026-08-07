import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'

const BIRTHDAY_DATE = '2026-08-06'

function isBirthdayWindow() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}` === BIRTHDAY_DATE
}

function getStorageKey() {
  return `birthday_dismissed_${BIRTHDAY_DATE}`
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

const BALLOONS = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  color: BALLOON_COLORS[i % BALLOON_COLORS.length],
  x: 2 + i * 5.5,
  delay: i * 0.18,
  size: 36 + (i % 4) * 14,
  duration: 6.5 + (i % 5) * 2.2,
}))

const STREAMERS = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  color: BALLOON_COLORS[i % BALLOON_COLORS.length],
  x: 10 + i * 15,
  delay: i * 0.25,
  duration: 4.2 + (i % 3) * 1.5,
}))

const KEYFRAMES = `
@keyframes bdayFall {
  0%   { transform: translateY(-20px) rotate(0deg)   translateX(0);                opacity: 1; }
  100% { transform: translateY(108vh) rotate(680deg) translateX(var(--bday-dx,0px)); opacity: 0.2; }
}
@keyframes bdayBalloon {
  0%   { transform: translateY(0) scale(0.8);      opacity: 0; }
  5%   { opacity: 1; transform: translateY(0) scale(1); }
  45%  { transform: translateY(-50vh) rotate(8deg); }
  70%  { transform: translateY(-95vh) rotate(-8deg); }
  92%  { opacity: 0.95; }
  100% { transform: translateY(-150vh); opacity: 0; }
}
@keyframes bdayStreamer {
  0%   { transform: translateY(0) scaleY(0);      opacity: 0; }
  8%   { opacity: 1; transform: translateY(0) scaleY(1); }
  50%  { transform: translateY(-45vh) rotateZ(var(--bday-rotate, 0deg)); }
  75%  { transform: translateY(-95vh) rotateZ(var(--bday-rotate, 0deg)); }
  95%  { opacity: 0.8; }
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
@keyframes bdayPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
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

    const storageKey = getStorageKey()
    const alreadyDismissed = localStorage.getItem(storageKey)

    if (alreadyDismissed) {
      setCardGone(true)
    }

    setVisible(true)
  }, [profile])

  const handleDismiss = () => {
    setCardGone(true)
    localStorage.setItem(getStorageKey(), 'true')
  }

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

      {/* Streamers */}
      {STREAMERS.map(s => (
        <div
          key={s.id}
          style={{
            position: 'fixed',
            top: -40,
            left: `${s.x}%`,
            width: 8,
            height: 500,
            background: `linear-gradient(180deg, ${s.color}, ${s.color}cc, transparent)`,
            borderRadius: 4,
            '--bday-rotate': `${(s.id - 3) * 15}deg`,
            animation: `bdayStreamer ${s.duration}s ${s.delay}s ease-in both`,
            zIndex: 9996,
            pointerEvents: 'none',
            transformOrigin: 'top center',
          }}
        />
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

      {/* Card — Sleek minimal design */}
      {!cardGone && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(360px, 88vw)',
            background: '#FFFFFF',
            border: '0.5px solid #E9E4D8',
            borderRadius: 12,
            overflow: 'hidden',
            zIndex: 9999,
            boxShadow: '0 12px 32px rgba(28,22,16,0.12)',
            animation: 'bdayCardIn 0.5s cubic-bezier(.22,1,.36,1) both',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          {/* Header — Nexus primary */}
          <div style={{
            background: 'var(--color-primary, #4C2A92)',
            padding: '36px 28px 28px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 14 }}>🎉</div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0em',
              lineHeight: 1.2,
            }}>
              Happy Birthday
            </div>
            <div style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.8)',
              marginTop: 6,
            }}>
              Pastor Sir
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '0.5px', background: 'var(--border, #E9E4D8)' }} />

          {/* Body */}
          <div style={{ padding: '28px 28px 24px', background: 'var(--surface, #FFFFFF)' }}>
            <p style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text-primary, #1C1610)',
              textAlign: 'center',
              fontWeight: 500,
            }}>
              Thank you for all the investments
              <br />you've made in us.
            </p>
            <p style={{
              margin: '10px 0 0',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text-secondary, #7A6F5E)',
              textAlign: 'center',
            }}>
              The Lord gave us the very best.
            </p>

            <p style={{
              margin: '16px 0 0',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary, #1C1610)',
              textAlign: 'center',
            }}>
              We love you immensely. 💛
            </p>

            {/* Button */}
            <button
              onClick={handleDismiss}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 20,
                padding: '11px 0',
                background: 'var(--color-primary, #4C2A92)',
                border: 'none',
                borderRadius: 'var(--radius, 8px)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary-hover, #3D1F6D)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-primary, #4C2A92)' }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </>
  )
}
