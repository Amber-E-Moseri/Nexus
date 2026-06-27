import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { MeetingsProvider } from '../../features/meetings/MeetingsContext'
import MinutesCapture from '../../features/meetings/components/MinutesCapture'
import ActionItemBridge from '../../features/meetings/components/ActionItemBridge'
import AudioTranscriptionPanel from '../../features/meetings/components/AudioTranscriptionPanel'

const TABS = [
  { id: 'minutes', label: '📝 Minutes' },
  { id: 'actions', label: '🎯 Actions' },
  { id: 'audio', label: '🎙 Audio' },
]

function MeetingDetailViewInner() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const { profile, role } = useAuth()

  const [meeting, setMeeting] = useState(null)
  const [agendaItems, setAgendaItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [isLive, setIsLive] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [currentAgendaIndex, setCurrentAgendaIndex] = useState(0)
  const [activeTab, setActiveTab] = useState('minutes')
  const [actionTabBadge, setActionTabBadge] = useState(0)

  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  const canManage = ['super_admin', 'dept_lead', 'ors'].includes(role)
  const canRecord = canManage

  // ── Data fetching ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!meetingId) return
    fetchMeeting()
  }, [meetingId])

  async function fetchMeeting() {
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('meetings')
        .select(`
          id, title, department_id, date, meeting_type, agenda, minutes,
          summary, zoom_join_url, drive_url, status, started_at,
          created_by, created_at,
          agendas(id, title, agenda_items(id, segment, notes, duration_minutes, sort_order))
        `)
        .eq('id', meetingId)
        .single()

      if (err) throw err
      setMeeting(data)

      // Build agenda items list — prefer structured agendas, fall back to text agenda
      const items = data.agendas?.[0]?.agenda_items
        ?.sort((a, b) => a.sort_order - b.sort_order)
        ?.map((i) => ({ id: i.id, title: i.segment, duration_minutes: i.duration_minutes }))
        ?? (data.agenda
          ? data.agenda.split('\n').filter(Boolean).map((line, idx) => ({ id: idx, title: line, duration_minutes: null }))
          : [])
      setAgendaItems(items)

      // Restore live state if meeting was already started
      if (data.status === 'in_progress' && data.started_at) {
        const elapsed = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000)
        setElapsedSeconds(elapsed)
        startTimeRef.current = new Date(data.started_at).getTime()
        setIsLive(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Timer ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isLive) {
      timerRef.current = setInterval(() => {
        const elapsed = startTimeRef.current
          ? Math.floor((Date.now() - startTimeRef.current) / 1000)
          : 0
        setElapsedSeconds(elapsed)
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isLive])

  const formatTime = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  // ── Start / End ──────────────────────────────────────────────────────────────

  async function handleStartMeeting() {
    const now = new Date().toISOString()
    const { error: err } = await supabase
      .from('meetings')
      .update({ status: 'in_progress', started_at: now })
      .eq('id', meetingId)
    if (err) { alert(err.message); return }
    startTimeRef.current = Date.now()
    setElapsedSeconds(0)
    setIsLive(true)
  }

  async function handleEndMeeting() {
    if (!window.confirm('End this meeting and save progress?')) return
    const { error: err } = await supabase
      .from('meetings')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', meetingId)
    if (err) { alert(err.message); return }
    setIsLive(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#7A6F5E', fontSize: 14 }}>
        Loading meeting…
      </div>
    )
  }

  if (error || !meeting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
        <div style={{ color: '#C73B2B', fontSize: 14 }}>Failed to load meeting: {error ?? 'Not found'}</div>
        <button onClick={() => navigate('/meetings')} style={{ padding: '8px 16px', border: 'none', background: '#4C2A92', color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>← Back to Meetings</button>
      </div>
    )
  }

  const currentItem = agendaItems[currentAgendaIndex] ?? null

  const tabLabels = TABS.map((t) =>
    t.id === 'actions' && actionTabBadge > 0
      ? { ...t, label: `🎯 Actions (+${actionTabBadge})` }
      : t
  )

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F4F1EA', fontFamily: 'inherit' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        .agenda-item:hover { background: #E8E3FF !important; }
      `}</style>

      {/* ── Sidebar: Agenda ── */}
      <div style={{ width: 260, flexShrink: 0, background: '#FBF8F2', borderRight: '1px solid #EDE8DC', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '16px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7A6F5E', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Agenda</div>
          {agendaItems.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9E9488', textAlign: 'center', marginTop: 24 }}>No agenda items</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {agendaItems.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  className="agenda-item"
                  onClick={() => setCurrentAgendaIndex(idx)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
                    padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: idx === currentAgendaIndex ? '#EDE8F8' : '#fff',
                    borderLeft: `3px solid ${idx === currentAgendaIndex ? '#4C2A92' : 'transparent'}`,
                    textAlign: 'left', transition: 'all .15s',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: idx === currentAgendaIndex ? '#4C2A92' : '#E9E4D8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                    color: idx === currentAgendaIndex ? '#fff' : '#7A6F5E',
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#2D2A22' }}>{item.title}</div>
                    {item.duration_minutes && (
                      <div style={{ fontSize: 10, color: '#9E9488', marginTop: 2 }}>{item.duration_minutes} min</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px', background: '#18122E', borderBottom: '1px solid #2D2520', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => navigate('/meetings')}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,.5)', fontSize: 18, cursor: 'pointer', padding: '4px 8px', flexShrink: 0 }}
            >
              ←
            </button>
            {isLive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF5A3C', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#FF9583', textTransform: 'uppercase', letterSpacing: '.5px' }}>Live</span>
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meeting.title}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>
                {new Date(meeting.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                {meeting.meeting_type ? ` · ${meeting.meeting_type}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
            {isLive && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontFamily: 'DM Mono, monospace' }}>{formatTime(elapsedSeconds)}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Elapsed</div>
              </div>
            )}
            {canManage && (
              isLive ? (
                <button
                  type="button"
                  onClick={handleEndMeeting}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#5D5551', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  End meeting
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartMeeting}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#4C2A92', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  Start meeting
                </button>
              )
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: '1px solid #E9E4D8', background: '#FAFAF8', flexShrink: 0 }}>
          {tabLabels.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '13px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? '#4C2A92' : '#7A6F5E',
                borderBottom: activeTab === tab.id ? '2px solid #4C2A92' : '2px solid transparent',
                transition: 'all .15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {activeTab === 'minutes' && (
            <MinutesCapture
              meeting={meeting}
              agendaItems={agendaItems}
              onClose={() => navigate('/meetings')}
            />
          )}

          {activeTab === 'actions' && (
            <ActionItemBridge
              meetingId={meetingId}
              departmentId={meeting.department_id}
              onSaved={(tasks) => {
                setActionTabBadge((n) => n + tasks.length)
              }}
              onCancel={() => {}}
            />
          )}

          {activeTab === 'audio' && (
            <AudioTranscriptionPanel
              meetingId={meetingId}
              departmentId={meeting.department_id}
              canRecord={canRecord && isLive}
              onTranscriptionComplete={() => {}}
              onActionItemsExtracted={(items) => {
                setActionTabBadge((n) => n + items.length)
                setActiveTab('actions')
              }}
            />
          )}
        </div>

        {/* Footer — visible when live */}
        {isLive && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 24px', borderTop: '1px solid #E9E4D8', background: '#FAFAF8', flexShrink: 0 }}>
            <div style={{ flex: 1 }} />
            {currentAgendaIndex < agendaItems.length - 1 && (
              <button
                type="button"
                onClick={() => setCurrentAgendaIndex((i) => i + 1)}
                style={{ padding: '9px 18px', borderRadius: 6, border: '1px solid #4C2A92', background: 'transparent', color: '#4C2A92', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Next agenda item →
              </button>
            )}
            <button
              type="button"
              onClick={handleEndMeeting}
              style={{ padding: '9px 18px', borderRadius: 6, border: 'none', background: '#4C2A92', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              End & save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MeetingDetailView() {
  const { meetingId } = useParams()
  return (
    <MeetingsProvider departmentId={null}>
      <MeetingDetailViewInner />
    </MeetingsProvider>
  )
}
