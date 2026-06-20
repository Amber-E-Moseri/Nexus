import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getAllDepartments } from '../../features/automations'
import { supabase } from '../../lib/supabase'
import MeetingModal from '../../features/meetings/components/MeetingModal'
import MeetingsList from '../../features/meetings/components/MeetingsList'
import MeetingsWorkspace from '../../features/meetings/components/MeetingsWorkspace'
import LiveMinutesMode from '../../features/meetings/components/LiveMinutesMode'
import LogView from '../../features/meetings/components/LogView'
import { MeetingsProvider } from '../../features/meetings/MeetingsContext'
import MeetingReportTab from '../../features/meetings/components/MeetingReportTab'
import ExpectedAttendeesPage from './ExpectedAttendeesPage'

function MeetingsViewContent({ viewMode, canManage, onAddMeeting, onStartLive }) {
  if (viewMode === 'workspace') {
    return <MeetingsWorkspace canManage={canManage} onStartLive={onStartLive} />
  }
  return <MeetingsList canManage={canManage} onAddMeeting={onAddMeeting} onStartLive={onStartLive} />
}

function MeetingsContent({ liveSession, viewMode, canManage, onAddMeeting, onStartLive, onCloseLive }) {
  if (liveSession) {
    return <LiveMinutesMode meeting={liveSession} onClose={onCloseLive} />
  }
  return (
    <MeetingsViewContent
      viewMode={viewMode}
      canManage={canManage}
      onAddMeeting={onAddMeeting}
      onStartLive={onStartLive}
    />
  )
}

function MeetingsModuleFallback() {
  const navigate = useNavigate()
  const { profile, role } = useAuth()
  const [departments, setDepartments] = useState([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(profile?.department_id ?? '')
  const [showModal, setShowModal] = useState(false)
  const [liveSession, setLiveSession] = useState(null)
  const [viewMode, setViewMode] = useState('log')
  const [kpiStats, setKpiStats] = useState({ logged30d: null, actionItems: null, withMinutes: null, deptCount: null })
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
    if (!selectedDepartmentId) return
    let active = true

    async function loadKpis() {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const cutoff = thirtyDaysAgo.toISOString()

      let meetingsQuery = supabase
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', cutoff)

      let actionsQuery = supabase
        .from('tasks')
        .select('id')
        .not('meeting_id', 'is', null)

      let withMinutesQuery = supabase
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .not('description', 'is', null)

      if (selectedDepartmentId !== 'all') {
        meetingsQuery = meetingsQuery.eq('department_id', selectedDepartmentId)
        actionsQuery = actionsQuery.eq('department_id', selectedDepartmentId)
        withMinutesQuery = withMinutesQuery.eq('department_id', selectedDepartmentId)
      }

      const [
        { count: logged30d },
        { data: actionData },
        { count: withMinutes },
        { data: depts },
      ] = await Promise.all([
        meetingsQuery,
        actionsQuery,
        withMinutesQuery,
        supabase
          .from('departments')
          .select('id'),
      ])

      if (!active) return
      setKpiStats({
        logged30d: logged30d ?? 0,
        actionItems: actionData?.length ?? 0,
        withMinutes: withMinutes ?? 0,
        deptCount: depts?.length ?? 0,
      })
    }

    loadKpis().catch(() => {})
    return () => {
      active = false
    }
  }, [selectedDepartmentId])

  useEffect(() => {
    if (!isSuperAdmin) {
      setSelectedDepartmentId(profile?.department_id ?? '')
      return
    }

    if (!selectedDepartmentId && departments.length > 0) {
      setSelectedDepartmentId('all')
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
    <MeetingsProvider key={selectedDepartmentId} departmentId={selectedDepartmentId}>
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
              {viewMode === 'log'
                ? 'Meeting OS records — agenda, attendance, summaries, and action items that flow back to the boards.'
                : 'Powered by Meeting OS'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center', borderRadius: 8, background: 'var(--surface-secondary)', padding: 2 }}>
              {['log', 'workspace'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: 'none',
                    background: viewMode === mode ? 'white' : 'transparent',
                    color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  {mode === 'log' ? 'Log' : 'Workspace'}
                </button>
              ))}
            </div>
            {canManage ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => navigate('/meetings/wizard')}
                  style={{
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'white',
                    padding: '9px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  📋 Plan
                </button>
                <button
                  type="button"
                  onClick={() => setLiveSession({ departmentId: selectedDepartmentId })}
                  style={{
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'white',
                    padding: '9px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#DC2626',
                    cursor: 'pointer',
                  }}
                >
                  ● Start live
                </button>
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
              </div>
            ) : null}
          </div>
        </div>

        {viewMode === 'log' ? (
          <LogView
            stats={{
              logged30d: kpiStats.logged30d,
              actionItems: kpiStats.actionItems,
              withMinutes: kpiStats.withMinutes,
              departments: kpiStats.deptCount,
            }}
            departments={isSuperAdmin ? departments : []}
            selectedDept={selectedDepartmentId}
            onDeptChange={setSelectedDepartmentId}
            canManage={canManage}
            onAddMeeting={() => setShowModal(true)}
            onStartLive={(meeting) => setLiveSession(meeting)}
          />
        ) : (
          <MeetingsContent
            liveSession={liveSession}
            viewMode="workspace"
            canManage={canManage}
            onAddMeeting={() => setShowModal(true)}
            onStartLive={(meeting) => setLiveSession(meeting)}
            onCloseLive={() => setLiveSession(null)}
          />
        )}

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
