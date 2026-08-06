import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
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

// ORS identity is a space_roles grant (Phase 3) — the old department-name
// dual identity ("member of a dept named ORS counts as ORS") is retired on
// both the RLS side (has_space_role swap) and here.

function TabBar({ active, onChange, visibleTabs, onClear }) {
  const isMobile = useMediaQuery('(max-width: 640px)')
  return (
    <div style={{ display: 'flex', gap: 4, padding: isMobile ? '0 12px' : '0 20px', background: '#FBF8F2' }}>
      {visibleTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => active === tab.key ? onClear() : onChange(tab.key)}
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
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function MeetingsList() {
  const navigate = useNavigate()
  const { profile, role } = useAuth()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [departments, setDepartments] = useState([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(profile?.department_id ?? '')
  const [showModal, setShowModal] = useState(false)
  const [liveSession, setLiveSession] = useState(null)
  const isSuperAdmin = role === 'super_admin' || role === 'regional_secretary'
  const canManage = ['super_admin', 'dept_lead'].includes((role ?? '').toLowerCase()) ||
                    hasSpaceRole(profile, null, 'ors') ||
                    hasSpaceRole(profile, null, 'dept_lead')
  const canLog = canManage || role === 'media'

  useEffect(() => {
    let active = true
    getAllDepartments()
      .then((data) => { if (active) setDepartments(data ?? []) })
      .catch(() => { if (active) setDepartments([]) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) { setSelectedDepartmentId(profile?.department_id ?? ''); return }
    if (!selectedDepartmentId && departments.length > 0) setSelectedDepartmentId('all')
  }, [departments, isSuperAdmin, profile?.department_id, selectedDepartmentId])

  if (!selectedDepartmentId) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
        No department is assigned to this account yet.
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
              style={{ borderRadius: 10, border: 'none', background: '#4C2A92', padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer' }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#6B3FAF' }}
              onMouseOut={(e) => { e.currentTarget.style.background = '#4C2A92' }}
            >
              + Log meeting
            </button>
            <button
              type="button"
              onClick={() => navigate('/meetings/wizard')}
              style={{ borderRadius: 10, border: '1px solid #C4B8E8', background: 'white', padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#4C2A92', cursor: 'pointer' }}
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

export default function MeetingsModule() {
  const { role, profile } = useAuth()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [searchParams, setSearchParams] = useSearchParams()

  const normalizedRole = (role ?? '').toLowerCase()
  const canViewRoster =
    ['super_admin', 'regional_secretary'].includes(normalizedRole) ||
    hasSpaceRole(profile, null, 'ors') ||
    hasSpaceRole(profile, null, 'programs') ||
    hasSpaceRole(profile, null, 'dept_lead')

  const TABS = [
    { key: 'report', label: 'Report' },
    { key: 'roster', label: 'Roster', restricted: true },
  ]
  const visibleTabs = TABS.filter(tab => !tab.restricted || canViewRoster)

  // null = meetings list (default); 'report' or 'roster' = tab view
  const [activeTab, setActiveTab] = useState(() => {
    if (searchParams.get('report') || searchParams.get('tab') === 'roster') {
      return searchParams.get('tab') === 'roster' ? 'roster' : 'report'
    }
    return null
  })

  useEffect(() => {
    if (searchParams.get('report')) { setActiveTab('report'); return }
    if (searchParams.get('tab') === 'roster') { setActiveTab('roster'); return }
    setActiveTab(null)
  }, [searchParams])

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

  function handleClearTab() {
    setActiveTab(null)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('tab')
    nextParams.delete('report')
    setSearchParams(nextParams)
  }

  const pageTitle = activeTab === 'report' ? 'Attendance Report' : activeTab === 'roster' ? 'Meeting Roster' : 'Meetings'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0, background: '#F7F5F0' }}>
      <div style={{ background: '#FBF8F2', borderBottom: '1px solid #EDE8DC', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '10px 16px 0' : '14px 24px 0', gap: 12 }}>
          <h1 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: '#18122E', margin: 0, letterSpacing: '-0.3px', flex: 1 }}>
            {pageTitle}
          </h1>
          <button
            type="button"
            onClick={() => navigate('/meetings/minutes')}
            title="View meeting minutes hub"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #EDE8DC',
              background: '#FFFFFF',
              color: '#4C2A92',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <FileText size={14} />
            Minutes Hub
          </button>
        </div>
        <TabBar active={activeTab} onChange={handleTabChange} visibleTabs={visibleTabs} onClear={handleClearTab} />
      </div>

      {activeTab === 'report' ? (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '1.5rem', background: '#FBF8F2' }}>
          <MeetingReportTab />
        </div>
      ) : activeTab === 'roster' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#FBF8F2' }}>
          <ExpectedAttendeesPage />
        </div>
      ) : (
        <MeetingsList />
      )}
    </div>
  )
}
