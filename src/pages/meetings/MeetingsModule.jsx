import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { getAllDepartments } from '../../features/automations'
import { hasSpaceRole } from '../../lib/permissions.js'
import MeetingModal from '../../features/meetings/components/MeetingModal'
import UnifiedMeetingsView from '../../features/meetings/components/UnifiedMeetingsView'
import LiveMinutesMode from '../../features/meetings/components/LiveMinutesMode'
import { MeetingsProvider } from '../../features/meetings/MeetingsContext'
import MeetingReportTab from '../../features/meetings/components/MeetingReportTab'
import ExpectedAttendeesPage from './ExpectedAttendeesPage'

function MeetingsModuleFallback() {
  const navigate = useNavigate()
  const { profile, role } = useAuth()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [departments, setDepartments] = useState([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(profile?.department_id ?? '')
  const [showModal, setShowModal] = useState(false)
  const [liveSession, setLiveSession] = useState(null)
  // Named isSuperAdmin historically, but gates "see/filter all departments" —
  // regional_secretary is near-super_admin and needs the same org-wide view
  // (RLS already grants them unconditional meeting access; this was the one
  // place the frontend still locked them to their own department).
  const isSuperAdmin = role === 'super_admin' || role === 'regional_secretary'
  const canManage = ['super_admin', 'dept_lead'].includes((role ?? '').toLowerCase()) ||
                    hasSpaceRole(profile, null, 'ors') ||
                    hasSpaceRole(profile, null, 'dept_lead')
  const canLog = canManage || role === 'media'

  useEffect(() => {
    let active = true

    getAllDepartments()
      .then((data) => {
        if (active) {
          setDepartments(data ?? [])
        }
      })
      .catch(() => {
        if (active) setDepartments([])
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) {
      setSelectedDepartmentId(profile?.department_id ?? '')
      return
    }

    if (!selectedDepartmentId && departments.length > 0) {
      setSelectedDepartmentId('all')
    }
  }, [departments, isSuperAdmin, profile?.department_id, selectedDepartmentId])

  if (!selectedDepartmentId) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
        No department is assigned to this account yet, so there is no meeting history to load.
      </div>
    )
  }

  if (liveSession) {
    return (
      <MeetingsProvider key={selectedDepartmentId} departmentId={selectedDepartmentId}>
        <LiveMinutesMode meeting={liveSession} onClose={() => setLiveSession(null)} />
        {showModal ? <MeetingModal departmentId={selectedDepartmentId} onClose={() => setShowModal(false)} /> : null}
      </MeetingsProvider>
    )
  }

  return (
    <MeetingsProvider key={selectedDepartmentId} departmentId={selectedDepartmentId}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto', gap: 0 }}>
        {canLog && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '8px 16px' : '10px 24px', borderBottom: '1px solid #EDE8DC', background: '#FBF8F2', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              style={{
                borderRadius: 10,
                border: 'none',
                background: '#4C2A92',
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#6B3FAF' }}
              onMouseOut={(e) => { e.currentTarget.style.background = '#4C2A92' }}
            >
              + Log meeting
            </button>
            <button
              type="button"
              onClick={() => navigate('/meetings/wizard')}
              style={{
                borderRadius: 10,
                border: '1px solid #C4B8E8',
                background: 'white',
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#4C2A92',
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#F3EEFF' }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'white' }}
            >
              Plan a meeting
            </button>
          </div>
        )}

        <UnifiedMeetingsView
          isSuperAdmin={isSuperAdmin}
          departments={departments}
          selectedDeptId={selectedDepartmentId}
          onDeptChange={setSelectedDepartmentId}
          canManage={canManage}
          onStartLive={(meeting) => setLiveSession(meeting)}
        />

        {showModal ? <MeetingModal departmentId={selectedDepartmentId} onClose={() => setShowModal(false)} /> : null}
      </div>
    </MeetingsProvider>
  )
}

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
    <div style={{ display: 'flex', gap: 0, padding: isMobile ? '0 12px' : '0 20px', background: '#FBF8F2', flexShrink: 0 }}>
      {visibleTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          style={{
            border: 'none',
            background: 'none',
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            color: active === tab.key ? '#4C2A92' : '#B0A89A',
            borderBottom: active === tab.key ? '2px solid #4C2A92' : '2px solid transparent',
            marginBottom: -1,
            transition: 'color .12s',
            letterSpacing: '-0.1px',
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
