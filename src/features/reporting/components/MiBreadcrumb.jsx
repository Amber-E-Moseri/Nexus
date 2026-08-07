import { ChevronRight } from 'lucide-react'

export default function MiBreadcrumb({ crumbs = [], onNavigate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, flexWrap: 'wrap', marginBottom: 16 }}>
      {crumbs.map((crumb, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <ChevronRight size={14} color="#BFBAB0" />}
          {i < crumbs.length - 1 ? (
            <button
              onClick={() => onNavigate && onNavigate(crumb)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: '#4C2A92',
                fontWeight: 500,
                fontSize: 13,
                fontFamily: 'inherit',
              }}
            >
              {crumb.label}
            </button>
          ) : (
            <span style={{ color: '#2D2A22', fontWeight: 600 }}>{crumb.label}</span>
          )}
        </span>
      ))}
    </div>
  )
}
