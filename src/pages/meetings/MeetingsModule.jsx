import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getAllDepartments } from '../../features/automations'
import MeetingModal from '../../features/meetings/components/MeetingModal'
import UnifiedMeetingsView from '../../features/meetings/components/UnifiedMeetingsView'
import LiveMinutesMode from '../../features/meetings/components/LiveMinutesMode'
import { MeetingsProvider } from '../../features/meetings/MeetingsContext'
import MeetingReportTab from '../../features/meetings/components/MeetingReportTab'
import ExpectedAttendeesPage from './ExpectedAttendeesPage'

function MeetingsModuleFallback() {
  const navigate = useNavigate()
  const { profile, role } = useAuth()
  const [departments, setDepartments] = useState([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(profile?.department_id ?? '')
  const [showModal, setShowModal] = useState(false)
  const [liveSession, setLiveSession] = useState(null)
  const isSuperAdmin = role === 'super_admin'
  const canManage = role !== 'member'

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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
        <div style={{ padding: '12px 24px', borderBottom: '0.5px solid var(--border)', background: 'white', flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Meetings</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Meeting OS records — agenda, attendance, summaries, and action items that flow back to the boards.</p>
          {canManage && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => navigate('/meetings/wizard')}
                style={{
                  borderRadius: 10,
                  border: '1px solid #4C2A92',
                  background: 'white',
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#4C2A92',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#F0EBFC'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'white'
                }}
              >
                📋 Plan
              </button>
              <button
                type="button"
                onClick={() => setLiveSession({ departmentId: selectedDepartmentId })}
                style={{
                  borderRadius: 10,
                  border: '1px solid #EF4444',
                  background: 'white',
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#DC2626',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#FEF2F2'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'white'
                }}
              >
                <span style={{ fontSize: 10, color: '#DC2626' }}>●</span>
                Start live
              </button>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                style={{
                  borderRadius: 10,
                  border: 'none',
                  background: '#4C2A92',
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#6B3FAF'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#4C2A92'
                }}
              >
                + Log meeting
              </button>
            </div>
          )}
        </div>

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
  { key: 'meetings', label: 'Meetings' },
  { key: 'report', label: 'Report' },
  { key: 'roster', label: '⚙ Roster' },
]

function TabBar({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '0.5px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          style={{
            border: 'none',
            background: 'none',
            padding: '10px 14px',
            fontSize: 13,
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

export default function MeetingsModule() {
  const meetingOsUrl = import.meta.env.VITE_MEETING_OS_URL
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    if (searchParams.get('report')) return 'report'
    if (searchParams.get('tab') === 'roster') return 'roster'
    return 'report'
  })

  useEffect(() => {
    if (searchParams.get('report')) {
      setActiveTab('report')
      return
    }
    if (searchParams.get('tab') === 'roster') {
      setActiveTab('roster')
      return
    }
    setActiveTab('meetings')
  }, [searchParams])

  function handleTabChange(nextTab) {
    setActiveTab(nextTab)
    const nextParams = new URLSearchParams(searchParams)

    if (nextTab === 'roster') {
      nextParams.delete('report')
      nextParams.set('tab', 'roster')
    } else if (nextTab === 'report') {
      nextParams.delete('tab')
    } else {
      nextParams.delete('tab')
      nextParams.delete('report')
    }

    setSearchParams(nextParams)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px 0',
          borderBottom: '0.5px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ paddingBottom: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            Meetings
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
            Powered by Meeting OS
          </p>
        </div>
        {meetingOsUrl && activeTab === 'meetings' ? (
          <a
            href={meetingOsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              color: 'var(--accent)',
              textDecoration: 'none',
              padding: '5px 10px',
              border: '0.5px solid var(--border)',
              borderRadius: 8,
              marginBottom: 10,
            }}
          >
            Open in new tab ↗
          </a>
        ) : null}
      </div>

      <TabBar active={activeTab} onChange={handleTabChange} />

      {activeTab === 'report' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#FBF8F2' }}>
          <MeetingReportTab />
        </div>
      ) : activeTab === 'roster' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#FBF8F2' }}>
          <ExpectedAttendeesPage />
        </div>
      ) : meetingOsUrl ? (
        <iframe
          src={meetingOsUrl}
          style={{ flex: 1, width: '100%', border: 'none', background: 'var(--surface-secondary)' }}
          title="Meeting OS"
          allow="microphone; camera"
        />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <div style={{ maxWidth: 1200 }}>
            <MeetingsModuleFallback />
          </div>
        </div>
      )}
    </div>
  )
}
