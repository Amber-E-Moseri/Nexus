import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import MeetingModal from '../../modules/meetings/MeetingModal'
import MeetingsList from '../../modules/meetings/MeetingsList'
import { MeetingsProvider } from '../../modules/meetings/MeetingsContext'
import MeetingReportTab from '../../modules/meetings/MeetingReportTab'
import ExpectedAttendeesPage from './ExpectedAttendeesPage'

function MeetingsContent({ canManage, onAddMeeting }) {
  return <MeetingsList canManage={canManage} onAddMeeting={onAddMeeting} />
}

function MeetingsModuleFallback() {
  const { profile, role } = useAuth()
  const [departments, setDepartments] = useState([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(profile?.department_id ?? '')
  const [showModal, setShowModal] = useState(false)
  const isSuperAdmin = role === 'super_admin'
  const canManage = role !== 'member'

  useEffect(() => {
    let active = true

    supabase
      .from('departments')
      .select('id, name, color')
      .order('name')
      .then(({ data }) => {
        if (active) {
          setDepartments(data ?? [])
        }
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
      setSelectedDepartmentId(departments[0].id)
    }
  }, [departments, isSuperAdmin, profile?.department_id, selectedDepartmentId])

  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === selectedDepartmentId) ?? null,
    [departments, selectedDepartmentId],
  )

  if (!selectedDepartmentId) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
        No department is assigned to this account yet, so there is no meeting history to load.
      </div>
    )
  }

  return (
    <MeetingsProvider departmentId={selectedDepartmentId}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>Meetings</h1>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-secondary)' }}>
              Keep Meeting OS as the live workspace, then log outcomes here to preserve attendance, summaries, and
              follow-up tasks.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {isSuperAdmin ? (
              <select
                value={selectedDepartmentId}
                onChange={(event) => setSelectedDepartmentId(event.target.value)}
                style={{
                  minWidth: 180,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'white',
                  padding: '9px 12px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}
              >
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            ) : null}
            {canManage ? (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                style={{
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--accent)',
                  padding: '9px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                + Log meeting
              </button>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'white',
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              height: 36,
              width: 36,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              background: selectedDepartment?.color ? `#${selectedDepartment.color}` : 'var(--accent)',
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {selectedDepartment?.name?.charAt(0) ?? 'M'}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {selectedDepartment?.name ?? 'Department meetings'}
            </div>
            <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
              Meeting records live here. The standalone Meeting OS remains unchanged until an embed URL is configured.
            </div>
          </div>
        </div>

        <MeetingsContent canManage={canManage} onAddMeeting={() => setShowModal(true)} />

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
    return 'meetings'
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
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Set <code>VITE_MEETING_OS_URL</code> in your environment to embed Meeting OS here. Until then, use the
              meeting log below.
            </p>
            <MeetingsModuleFallback />
          </div>
        </div>
      )}
    </div>
  )
}
