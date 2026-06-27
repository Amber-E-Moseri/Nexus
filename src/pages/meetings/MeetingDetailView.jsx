import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { MeetingsProvider } from '../../features/meetings/MeetingsContext'
import MinutesCapture from '../../features/meetings/components/MinutesCapture'
import ActionItemBridge from '../../features/meetings/components/ActionItemBridge'
import AudioTranscriptionPanel from '../../features/meetings/components/AudioTranscriptionPanel'

// ── Design tokens matching the HTML reference ──────────────────────────────
const C = {
  navy:        '#18122E',
  navyLight:   '#2A1F4A',
  purple:      '#4C2A92',
  coral:       '#F06449',
  sage:        '#2D8653',
  amber:       '#E8A020',
  cream:       '#F4F1EA',
  creamAlt:    '#EDE8DC',
  border:      '#E5DDD0',
  text:        '#1C1C1C',
  muted:       '#7A6F5E',
  xmuted:      '#B0A89A',
  surface:     '#FAFAF8',
  navyGhost:   'rgba(76,42,146,.08)',
}

const TABS = [
  { id: 'minutes', icon: '📝', label: 'Minutes' },
  { id: 'actions', icon: '🎯', label: 'Actions' },
  { id: 'audio',   icon: '🎙️', label: 'Audio' },
  { id: 'docs',    icon: '📎', label: 'Docs' },
  { id: 'ai',      icon: '⚡', label: 'AI Extract' },
]

function MeetingDetailViewInner() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()

  const [meeting, setMeeting]               = useState(null)
  const [agendaItems, setAgendaItems]       = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [mode, setMode]                     = useState('prep') // prep | live | post
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [currentAgendaIndex, setCurrentAgendaIndex] = useState(0)
  const [activeTab, setActiveTab]           = useState('minutes')
  const [actionBadge, setActionBadge]       = useState(0)
  const [minutesText, setMinutesText]       = useState('')
  const [published, setPublished]           = useState(false)
  const [saving, setSaving]                 = useState(false)

  const timerRef    = useRef(null)
  const startRef    = useRef(null)

  const canManage = ['super_admin', 'dept_lead', 'ors'].includes(role)
  const isLive    = mode === 'live'
  const isPrep    = mode === 'prep'
  const isPost    = mode === 'post'

  // ── Fetch meeting ──────────────────────────────────────────────────────────

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
      if (data.minutes) setMinutesText(data.minutes)

      const items = data.agendas?.[0]?.agenda_items
        ?.sort((a, b) => a.sort_order - b.sort_order)
        ?.map((i) => ({ id: i.id, title: i.segment, duration_minutes: i.duration_minutes }))
        ?? (data.agenda
          ? data.agenda.split('\n').filter(Boolean).map((line, idx) => ({ id: idx, title: line, duration_minutes: null }))
          : [])
      setAgendaItems(items)

      if (data.status === 'in_progress' && data.started_at) {
        const elapsed = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000)
        setElapsedSeconds(elapsed)
        startRef.current = new Date(data.started_at).getTime()
        setMode('live')
      } else if (data.status === 'completed') {
        setMode('post')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Timer ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isLive) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(startRef.current
          ? Math.floor((Date.now() - startRef.current) / 1000)
          : 0)
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
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    return `${m}:${String(sec).padStart(2,'0')}`
  }

  // ── Start / End ────────────────────────────────────────────────────────────

  async function handleStartMeeting() {
    const now = new Date().toISOString()
    const { error: err } = await supabase
      .from('meetings')
      .update({ status: 'in_progress', started_at: now })
      .eq('id', meetingId)
    if (err) { alert(err.message); return }
    startRef.current = Date.now()
    setElapsedSeconds(0)
    setMode('live')
    setActiveTab('minutes')
  }

  async function handleEndMeeting() {
    if (!window.confirm('End this meeting and save progress?')) return
    const { error: err } = await supabase
      .from('meetings')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', meetingId)
    if (err) { alert(err.message); return }
    setMode('post')
    setActiveTab('audio')
  }

  async function handlePublishMinutes() {
    setSaving(true)
    const { error: err } = await supabase
      .from('meetings')
      .update({ minutes: minutesText })
      .eq('id', meetingId)
    setSaving(false)
    if (err) { alert(err.message); return }
    setPublished(true)
    setTimeout(() => setPublished(false), 3000)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color: C.muted, fontSize:14 }}>
        Loading meeting…
      </div>
    )
  }

  if (error || !meeting) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', gap:12 }}>
        <div style={{ color:'#C73B2B', fontSize:14 }}>Failed to load meeting: {error ?? 'Not found'}</div>
        <button onClick={() => navigate('/meetings')} style={{ padding:'8px 16px', border:'none', background: C.purple, color:'#fff', borderRadius:6, cursor:'pointer', fontWeight:600, fontSize:13 }}>
          ← Back to Meetings
        </button>
      </div>
    )
  }

  const currentItem = agendaItems[currentAgendaIndex] ?? null
  const meetingDate = new Date(meeting.date).toLocaleDateString('en-CA', { weekday:'short', month:'short', day:'numeric', year:'numeric' })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background: C.cream, fontFamily:'inherit', overflow:'hidden' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes wave  { 0%,100%{scaleY:.4} 50%{scaleY:1} }
        .agenda-btn:hover { background: #E8E3FF !important; }
        .tab-btn:hover    { color: ${C.purple} !important; }
        .mode-pill:hover  { opacity:.85 !important; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 20px', height:64, background: C.navy, flexShrink:0,
        borderBottom:`1px solid ${C.navyLight}`,
      }}>
        {/* Left: back + live indicator + title */}
        <div style={{ display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0 }}>
          <button
            type="button"
            onClick={() => navigate('/meetings')}
            style={{ background:'transparent', border:'none', color:'rgba(255,255,255,.4)', fontSize:18, cursor:'pointer', padding:'4px 8px', flexShrink:0, lineHeight:1 }}
          >
            ←
          </button>

          {isLive && (
            <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0, background:'rgba(240,100,73,.15)', padding:'4px 10px', borderRadius:20 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background: C.coral, animation:'pulse 1.5s infinite' }} />
              <span style={{ fontSize:11, fontWeight:700, color: C.coral, textTransform:'uppercase', letterSpacing:'.6px' }}>Live</span>
            </div>
          )}
          {isPost && (
            <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0, background:'rgba(45,134,83,.15)', padding:'4px 10px', borderRadius:20 }}>
              <span style={{ fontSize:11, fontWeight:700, color: C.sage, textTransform:'uppercase', letterSpacing:'.6px' }}>✓ Completed</span>
            </div>
          )}

          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {meeting.title}
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginTop:2 }}>
              {meetingDate}{meeting.meeting_type ? ` · ${meeting.meeting_type}` : ''}
            </div>
          </div>
        </div>

        {/* Right: timer + mode pills + action buttons */}
        <div style={{ display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
          {isLive && (
            <div style={{ textAlign:'right', marginRight:4 }}>
              <div style={{ fontSize:22, fontWeight:700, color:'#fff', fontFamily:'DM Mono, "Courier New", monospace', letterSpacing:'-.5px' }}>
                {formatTime(elapsedSeconds)}
              </div>
              <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,.35)', textTransform:'uppercase', letterSpacing:'.6px' }}>Elapsed</div>
            </div>
          )}

          {/* Mode pills */}
          {canManage && (
            <div style={{ display:'flex', gap:2, background:'rgba(255,255,255,.07)', borderRadius:10, padding:3 }}>
              <button
                type="button"
                className="mode-pill"
                onClick={isPrep ? undefined : () => setMode('prep')}
                style={{
                  padding:'5px 11px', border:'none', borderRadius:8, cursor: isPrep ? 'default' : 'pointer',
                  background: isPrep ? C.purple : 'transparent',
                  color: isPrep ? '#fff' : 'rgba(255,255,255,.45)',
                  fontSize:11, fontWeight:700, transition:'all .15s',
                }}
              >
                Prep
              </button>
              <button
                type="button"
                className="mode-pill"
                onClick={isLive ? undefined : handleStartMeeting}
                style={{
                  padding:'5px 11px', border:'none', borderRadius:8, cursor: isLive ? 'default' : 'pointer',
                  background: isLive ? C.coral : 'transparent',
                  color: isLive ? '#fff' : 'rgba(255,255,255,.45)',
                  fontSize:11, fontWeight:700, transition:'all .15s',
                  display:'flex', alignItems:'center', gap:5,
                }}
              >
                {!isLive && <span style={{ fontSize:9 }}>●</span>}
                {isLive ? '● Live' : 'Start live'}
              </button>
              <button
                type="button"
                className="mode-pill"
                onClick={isPost ? undefined : handleEndMeeting}
                style={{
                  padding:'5px 11px', border:'none', borderRadius:8, cursor: isPost ? 'default' : 'pointer',
                  background: isPost ? C.sage : 'transparent',
                  color: isPost ? '#fff' : 'rgba(255,255,255,.45)',
                  fontSize:11, fontWeight:700, transition:'all .15s',
                }}
              >
                Post
              </button>
            </div>
          )}

          {isLive && canManage && (
            <button
              type="button"
              onClick={handleEndMeeting}
              style={{ padding:'7px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'rgba(255,255,255,.75)', fontSize:12, fontWeight:600, cursor:'pointer' }}
            >
              End
            </button>
          )}

          {isPost && canManage && (
            <button
              type="button"
              onClick={handlePublishMinutes}
              disabled={saving}
              style={{ padding:'7px 14px', borderRadius:8, border:'none', background: C.sage, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}
            >
              {saving ? 'Saving…' : published ? '✓ Saved!' : 'Publish minutes →'}
            </button>
          )}
        </div>
      </div>

      {/* ── BODY: sidebar + main ── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Sidebar */}
        <div style={{ width:260, flexShrink:0, background:'#FBF8F2', borderRight:`1px solid ${C.creamAlt}`, display:'flex', flexDirection:'column', overflowY:'auto' }}>
          <div style={{ padding:'16px 14px' }}>
            <div style={{ fontSize:10, fontWeight:700, color: C.xmuted, textTransform:'uppercase', letterSpacing:'.6px', marginBottom:10 }}>Agenda</div>

            {agendaItems.length === 0 ? (
              <p style={{ fontSize:12, color: C.xmuted, textAlign:'center', marginTop:20 }}>No agenda items</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {agendaItems.map((item, idx) => {
                  const active = idx === currentAgendaIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="agenda-btn"
                      onClick={() => setCurrentAgendaIndex(idx)}
                      style={{
                        display:'flex', alignItems:'flex-start', gap:10, width:'100%',
                        padding:'10px 12px', borderRadius:8, border: active ? `1px solid #C4B5F4` : `1px solid ${C.border}`,
                        cursor:'pointer', textAlign:'left', transition:'all .15s',
                        background: active ? C.navyGhost : C.surface,
                      }}
                    >
                      <div style={{
                        width:20, height:20, borderRadius:'50%', flexShrink:0,
                        background: active ? C.purple : C.creamAlt,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, fontWeight:700, color: active ? '#fff' : C.muted,
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, color: active ? C.purple : C.text, lineHeight:1.3 }}>{item.title}</div>
                        {item.duration_minutes && (
                          <div style={{ fontSize:10, color: C.xmuted, marginTop:2 }}>{item.duration_minutes} min</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {isLive && currentAgendaIndex < agendaItems.length - 1 && (
              <button
                type="button"
                onClick={() => setCurrentAgendaIndex((i) => i + 1)}
                style={{ marginTop:10, width:'100%', padding:'8px', borderRadius:8, border:`1px solid ${C.purple}`, background:'transparent', color: C.purple, fontSize:11, fontWeight:600, cursor:'pointer' }}
              >
                Next item →
              </button>
            )}
          </div>

          {meeting.zoom_join_url && (
            <div style={{ padding:'0 14px 14px' }}>
              <div style={{ fontSize:10, fontWeight:700, color: C.xmuted, textTransform:'uppercase', letterSpacing:'.6px', marginBottom:8 }}>Meeting Link</div>
              <a
                href={meeting.zoom_join_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display:'block', padding:'8px 12px', borderRadius:8, background: C.navyGhost, color: C.purple, fontSize:12, fontWeight:600, textDecoration:'none' }}
              >
                🔗 Join Zoom
              </a>
            </div>
          )}
        </div>

        {/* Main */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

          {/* Current agenda context bar */}
          {currentItem && (
            <div style={{
              padding:'10px 24px', background:'#fff', borderBottom:`1px solid ${C.creamAlt}`,
              display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
            }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color: C.xmuted, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:2 }}>Current agenda item</div>
                <div style={{ fontSize:13, fontWeight:600, color: C.text }}>{currentItem.title}</div>
              </div>
              {currentItem.duration_minutes && (
                <div style={{ fontSize:11, color: C.muted, background: C.navyGhost, padding:'4px 10px', borderRadius:20 }}>
                  {currentItem.duration_minutes} min allocated
                </div>
              )}
            </div>
          )}

          {/* Tab bar */}
          <div style={{ display:'flex', gap:0, padding:'0 24px', borderBottom:`1px solid ${C.creamAlt}`, background:'#fff', flexShrink:0 }}>
            {TABS.map((tab) => {
              const active = activeTab === tab.id
              const badge = tab.id === 'actions' && actionBadge > 0 ? actionBadge : null
              return (
                <button
                  key={tab.id}
                  type="button"
                  className="tab-btn"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding:'12px 16px', border:'none', background:'transparent', cursor:'pointer',
                    fontSize:13, fontWeight: active ? 700 : 500,
                    color: active ? C.navy : C.muted,
                    borderBottom: active ? `2px solid ${C.navy}` : '2px solid transparent',
                    transition:'all .15s', display:'flex', alignItems:'center', gap:6,
                    marginBottom:-1,
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {badge && (
                    <span style={{ fontSize:10, fontWeight:700, background: C.navyGhost, color: C.purple, borderRadius:10, padding:'1px 6px' }}>
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div style={{ flex:1, overflowY:'auto', padding:24, background: C.cream }}>

            {/* Minutes tab */}
            {activeTab === 'minutes' && (
              <div>
                {/* Discussion notes */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color: C.muted, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
                    Discussion notes · {currentItem?.title ?? 'General'}
                  </div>
                  <textarea
                    value={minutesText}
                    onChange={(e) => setMinutesText(e.target.value)}
                    placeholder="Type meeting notes here…"
                    rows={8}
                    style={{
                      width:'100%', padding:'12px 14px', borderRadius:10, border:`1px solid ${C.border}`,
                      fontSize:13, color: C.text, background:'#fff', fontFamily:'inherit',
                      resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box',
                    }}
                  />
                  <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8, gap:8 }}>
                    {published && (
                      <span style={{ fontSize:12, color: C.sage, fontWeight:600, alignSelf:'center' }}>✓ Minutes saved</span>
                    )}
                    <button
                      type="button"
                      onClick={handlePublishMinutes}
                      disabled={saving}
                      style={{ padding:'8px 16px', borderRadius:8, border:'none', background: C.navy, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}
                    >
                      {saving ? 'Saving…' : 'Publish minutes'}
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderTop:`1px solid ${C.border}`, marginBottom:20 }} />

                {/* Full minutes component */}
                <MinutesCapture
                  meeting={meeting}
                  agendaItems={agendaItems}
                  onClose={() => navigate('/meetings')}
                />
              </div>
            )}

            {/* Actions tab */}
            {activeTab === 'actions' && (
              <ActionItemBridge
                meetingId={meetingId}
                departmentId={meeting.department_id}
                onSaved={(tasks) => setActionBadge((n) => n + tasks.length)}
                onCancel={() => {}}
              />
            )}

            {/* Audio tab */}
            {activeTab === 'audio' && (
              <div>
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:12, color: C.muted, marginBottom:16 }}>
                    {isLive
                      ? 'Record from microphone · Deepgram transcription'
                      : 'Post-meeting audio · MP3, WAV, M4A · max 25 MB'}
                  </div>
                </div>
                <AudioTranscriptionPanel
                  meetingId={meetingId}
                  departmentId={meeting.department_id}
                  canRecord={canManage && isLive}
                  onTranscriptionComplete={() => {}}
                  onActionItemsExtracted={(items) => {
                    setActionBadge((n) => n + items.length)
                    setActiveTab('actions')
                  }}
                />
              </div>
            )}

            {/* Docs tab */}
            {activeTab === 'docs' && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color: C.muted, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:16 }}>
                  Meeting Documents
                </div>
                {meeting.drive_url ? (
                  <a
                    href={meeting.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display:'flex', alignItems:'center', gap:12, padding:'14px 16px',
                      borderRadius:10, border:`1px solid ${C.border}`, background:'#fff',
                      textDecoration:'none', color: C.text, fontSize:13, fontWeight:600,
                    }}
                  >
                    <span style={{ fontSize:20 }}>📄</span>
                    <div>
                      <div>Drive documents</div>
                      <div style={{ fontSize:11, color: C.muted, fontWeight:400 }}>Uploaded to Google Drive</div>
                    </div>
                    <span style={{ marginLeft:'auto', color: C.purple, fontSize:12 }}>Open ↗</span>
                  </a>
                ) : (
                  <div style={{ padding:'40px 20px', textAlign:'center', color: C.xmuted, fontSize:13 }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>📎</div>
                    No documents attached to this meeting.
                  </div>
                )}
              </div>
            )}

            {/* AI Extract tab */}
            {activeTab === 'ai' && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color: C.muted, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
                  AI Extract
                </div>
                <div style={{ fontSize:12, color: C.muted, marginBottom:20 }}>
                  Claude-powered · extracts decisions, action items, and key takeaways from transcription
                </div>

                {meeting.summary ? (
                  <div style={{ padding:'16px 20px', borderRadius:12, background:'#fff', border:`1px solid ${C.border}`, fontSize:13, color: C.text, lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                    {meeting.summary}
                  </div>
                ) : (
                  <div style={{ textAlign:'center', padding:'40px 20px', color: C.xmuted }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>⚡</div>
                    <div style={{ fontSize:13, marginBottom:16 }}>No AI summary yet.</div>
                    <div style={{ fontSize:12 }}>
                      Record audio in the Audio tab, then use "Extract to minutes" to generate an AI summary.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
