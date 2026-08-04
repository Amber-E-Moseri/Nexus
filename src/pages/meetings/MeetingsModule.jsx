import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { hasSpaceRole } from '../../lib/permissions.js'
import MeetingReportTab from '../../features/meetings/components/MeetingReportTab'
import ExpectedAttendeesPage from './ExpectedAttendeesPage'

const TABS = [
  { key: 'report', label: 'Report' },
  { key: 'roster', label: 'Roster', restricted: true },
]

// ORS identity is a space_roles grant (Phase 3) — the old department-name
// dual identity ("member of a dept named ORS counts as ORS") is retired on
// both the RLS side (has_space_role swap) and here.

function TabBar({ active, onChange, visibleTabs }) {
  const isMobile = useMediaQuery('(max-width: 640px)')
  return (
    <div style={{ display: 'flex', gap: 4, padding: isMobile ? '0 12px' : '0 20px', background: '#FBF8F2' }}>
      {visibleTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          style={{
            border: 'none',
            background: 'none',
            padding: '8px 12px',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            color: active === tab.key ? '#4C2A92' : '#9E9488',
            borderBottom: active === tab.key ? '2px solid #4C2A92' : '2px solid transparent',
            marginBottom: -1,
            transition: 'color .12s',
            letterSpacing: '0',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default function MeetingsModule() {
  const { role, profile } = useAuth()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [searchParams, setSearchParams] = useSearchParams()

  // Roster (expected-attendees management) stays leadership-only. Report is
  // no longer gated by this — see TABS above.
  const normalizedRole = (role ?? '').toLowerCase()
  const canViewRoster =
    ['super_admin', 'regional_secretary'].includes(normalizedRole) ||
    hasSpaceRole(profile, null, 'ors') ||
    hasSpaceRole(profile, null, 'programs') ||
    hasSpaceRole(profile, null, 'dept_lead')

  // Filter tabs based on access
  const visibleTabs = TABS.filter(tab => !tab.restricted || canViewRoster)

  const [activeTab, setActiveTab] = useState(() => {
    const initial = searchParams.get('tab') === 'roster' ? 'roster' : 'report'
    return visibleTabs.some(t => t.key === initial) ? initial : 'report'
  })

  useEffect(() => {
    const requestedTab = searchParams.get('tab') === 'roster' ? 'roster' : 'report'
    if (!visibleTabs.some(t => t.key === requestedTab)) {
      setActiveTab('report')
      return
    }
    setActiveTab(requestedTab)
  }, [searchParams, visibleTabs])

  function handleTabChange(nextTab) {
    if (!visibleTabs.some(t => t.key === nextTab)) return
    setActiveTab(nextTab)
    const nextParams = new URLSearchParams(searchParams)
    if (nextTab === 'roster') {
      nextParams.delete('report')
      nextParams.set('tab', 'roster')
    } else {
      nextParams.delete('tab')
      nextParams.set('report', '1')
    }
    setSearchParams(nextParams)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0, background: '#F7F5F0' }}>
      {/* Compact header + tabs in one bar */}
      <div style={{ background: '#FBF8F2', borderBottom: '1px solid #EDE8DC', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: isMobile ? '10px 16px 0' : '14px 24px 0' }}>
          <h1 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: '#18122E', margin: 0, letterSpacing: '-0.3px', flex: 1 }}>
            Attendance Report
          </h1>
        </div>
        <TabBar active={activeTab} onChange={handleTabChange} visibleTabs={visibleTabs} />
      </div>

      {activeTab === 'report' ? (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '1.5rem', background: '#FBF8F2' }}>
          <MeetingReportTab />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#FBF8F2' }}>
          <ExpectedAttendeesPage />
        </div>
      )}
    </div>
  )
}
