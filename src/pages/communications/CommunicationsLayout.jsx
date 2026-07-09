import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { FONT_HEADING } from '../../lib/fonts'

const PRIMARY = 'var(--purple-700)'
const BORDER = 'var(--border-1)'
const TEXT = 'var(--ink-1)'
const MUTED = 'var(--ink-3)'

const TABS = [
  { to: '/communications', label: 'Overview', end: true },
  { to: '/communications/campaigns', label: 'Campaigns' },
  { to: '/communications/templates', label: 'Templates' },
  { to: '/communications/recipients', label: 'Recipients' },
  { to: '/communications/segments', label: 'Segments' },
  { to: '/communications/analytics', label: 'Analytics' },
  { to: '/communications/invitations', label: 'Invitations' },
  { to: '/communications/absentees', label: 'Absentee Follow-up' },
]

export default function CommunicationsLayout() {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 24px',
          borderBottom: `1px solid ${BORDER}`,
          background: '#FFFFFF',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: FONT_HEADING,
            fontSize: 15,
            fontWeight: 800,
            color: TEXT,
            padding: '14px 0',
            whiteSpace: 'nowrap',
          }}
        >
          Communications
        </div>
        <nav style={{ display: 'flex', gap: 2, flex: 1, overflowX: 'auto', alignSelf: 'stretch' }}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? PRIMARY : MUTED,
                textDecoration: 'none',
                borderBottom: isActive ? `3px solid ${PRIMARY}` : '3px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => navigate('/communications/compose')}
          style={{
            border: 'none',
            background: PRIMARY,
            color: '#FFFFFF',
            borderRadius: 9,
            padding: '7px 14px',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          + New Campaign
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Outlet />
      </div>
    </div>
  )
}
