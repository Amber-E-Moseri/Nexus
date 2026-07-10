import { SEVERITY_COLOR } from '../lib/warningEngine'

const SEVERITY_BG = {
  red: '#FBEAE6',
  orange: '#FCF3E3',
  yellow: '#FBF6E0',
}

// Non-blocking nudge banners at the top of the Planner. Shows the worst
// warning per block; each can be dismissed for the session.
export default function WarningBanner({ warnings, onDismiss }) {
  if (!warnings || warnings.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      {warnings.map((w) => (
        <div
          key={w.key}
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: SEVERITY_BG[w.severity],
            border: `1px solid ${SEVERITY_COLOR[w.severity]}55`,
            borderLeft: `4px solid ${SEVERITY_COLOR[w.severity]}`,
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12.5,
            color: '#2D2A22',
          }}
        >
          <span aria-hidden="true">⚠️</span>
          <span style={{ flex: 1 }}>{w.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(w.key)}
            aria-label="Dismiss warning"
            style={{ border: 'none', background: 'transparent', color: '#9E9488', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}
