import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { MeetingsProvider } from '../../features/meetings/MeetingsContext'
import ActionItemBridge from '../../features/meetings/components/ActionItemBridge'
import AudioTranscriptionPanel from '../../features/meetings/components/AudioTranscriptionPanel'

// exact colors from the HTML reference
const FS = {
  navy:       '#18122E',
  navyD:      '#0E0A1C',
  navyGhost:  'rgba(24,18,46,.08)',
  navyL:      'rgba(76,42,146,.25)',
  purple:     '#4C2A92',
  coral:      '#F06449',
  coralL:     'rgba(240,100,73,.12)',
  sage:       '#2D8653',
  sageL:      'rgba(45,134,83,.12)',
  amber:      '#E8A020',
  bg:         '#F7F5F0',
  surface:    '#FAFAF8',
  surfaceAlt: '#F0EBE2',
  border:     '#E5DDD0',
  borderL:    '#EDE8DC',
  text:       '#1C1C1C',
  muted:      '#7A6F5E',
  xmuted:     '#B0A89A',
  sidebarBg:  '#FBF8F2',
  sidebarBd:  '#EDE8DC',
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
  const navigate      = useNavigate()
  const { role }      = useAuth()

  const [meeting, setMeeting]   = useState(null)
  const [agenda, setAgenda]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [fetchErr, setFetchErr] = useState(null)

  const [mode, setMode]                         = useState('prep') // prep | live | post
  const [elapsed, setElapsed]                   = useState(0)
  const [recording, setRecording]               = useState(false)
  const [currentIdx, setCurrentIdx]             = useState(0)
  const [activeTab, setActiveTab]               = useState('minutes')
  const [actionBadge, setActionBadge]           = useState(0)
  const [minutesText, setMinutesText]           = useState('')
  const [published, setPublished]               = useState(false)
  const [saving, setSaving]                     = useState(false)

  const timerRef  = useRef(null)
  const startRef  = useRef(null)
  const totalSecs = 90 * 60 // estimate 90 min for progress bar

  const canManage = ['super_admin', 'dept_lead', 'ors'].includes(role)
  const isLive    = mode === 'live'
  const isPrep    = mode === 'prep'
  const isPost    = mode === 'post'

  // ── fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => { if (meetingId) fetchMeeting() }, [meetingId])

  async function fetchMeeting() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select(`
          id, title, department_id, date, meeting_type, agenda, minutes,
          summary, zoom_join_url, drive_url, status, started_at,
          created_by, created_at,
          agendas(id, title, agenda_items(id, segment, notes, duration_minutes, sort_order))
        `)
        .eq('id', meetingId)
        .single()
      if (error) throw error

      setMeeting(data)
      if (data.minutes) setMinutesText(data.minutes)

      const items = data.agendas?.[0]?.agenda_items
        ?.sort((a, b) => a.sort_order - b.sort_order)
        ?.map(i => ({ id: i.id, title: i.segment, mins: i.duration_minutes }))
        ?? (data.agenda
          ? data.agenda.split('\n').filter(Boolean).map((l, i) => ({ id: i, title: l, mins: null }))
          : [])
      setAgenda(items)

      if (data.status === 'in_progress' && data.started_at) {
        const s = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000)
        startRef.current = new Date(data.started_at).getTime()
        setElapsed(s)
        setMode('live')
      } else if (data.status === 'completed') {
        setMode('post')
      }
    } catch (e) {
      setFetchErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── timer ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isLive) {
      timerRef.current = setInterval(() => {
        setElapsed(startRef.current
          ? Math.floor((Date.now() - startRef.current) / 1000) : 0)
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isLive])

  const fmt = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    return `${m}:${String(sec).padStart(2,'0')}`
  }

  const timerPct = Math.min(100, Math.round(elapsed / totalSecs * 100)) + '%'

  // ── actions ────────────────────────────────────────────────────────────────

  async function startLive() {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('meetings').update({ status: 'in_progress', started_at: now }).eq('id', meetingId)
    if (error) { alert(error.message); return }
    startRef.current = Date.now()
    setElapsed(0)
    setMode('live')
    setActiveTab('minutes')
  }

  async function endMeeting() {
    if (!window.confirm('End this meeting and save progress?')) return
    const { error } = await supabase
      .from('meetings').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', meetingId)
    if (error) { alert(error.message); return }
    setMode('post')
    setRecording(false)
    setActiveTab('audio')
  }

  async function publishMinutes() {
    setSaving(true)
    const { error } = await supabase.from('meetings').update({ minutes: minutesText }).eq('id', meetingId)
    setSaving(false)
    if (error) { alert(error.message); return }
    setPublished(true)
    setTimeout(() => setPublished(false), 3000)
  }

  // ── loading / error ────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color: FS.muted, fontSize:14 }}>
      Loading meeting…
    </div>
  )

  if (fetchErr || !meeting) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', gap:12 }}>
      <div style={{ color:'#C73B2B', fontSize:14 }}>Failed to load meeting: {fetchErr ?? 'Not found'}</div>
      <button onClick={() => navigate('/meetings')} style={{ padding:'8px 16px', border:'none', background: FS.navy, color:'#fff', borderRadius:6, cursor:'pointer', fontWeight:600, fontSize:13 }}>
        ← Back to Meetings
      </button>
    </div>
  )

  const dateLabel = new Date(meeting.date).toLocaleDateString('en-CA', { weekday:'long', month:'short', day:'numeric', year:'numeric' })
  const timeRange = meeting.meeting_type ? `${meeting.meeting_type} meeting` : 'Meeting'
  const currentItem = agenda[currentIdx] ?? null

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', fontFamily:'inherit', background: FS.bg }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
      `}</style>

      {/* ── LIVE HEADER ── dark #18122E */}
      {isLive && (
        <div style={{ flexShrink:0, background: FS.navy, color:'#fff', padding:'13px 20px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <button onClick={() => navigate('/meetings')} style={{ background:'transparent', border:'none', color:'rgba(255,255,255,.4)', fontSize:16, cursor:'pointer', padding:'0 6px 0 0', lineHeight:1 }}>←</button>
          {/* LIVE pill */}
          <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(201,72,48,.18)', border:'1px solid rgba(201,72,48,.5)', color:'#FF9583', borderRadius:999, padding:'4px 11px', fontSize:10, fontWeight:700, letterSpacing:'.06em' }}>
            <span style={{ width:7, height:7, borderRadius:999, background:'#FF5A3C', animation:'pulse 1.5s infinite', display:'inline-block' }} />
            LIVE
          </span>
          {/* Title */}
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ fontSize:15, fontWeight:800 }}>{meeting.title}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.55)', marginTop:1 }}>{timeRange} · {dateLabel}</div>
          </div>
          {/* Right controls */}
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {/* Timer */}
            <div style={{ textAlign:'right' }}>
              <div style={{ fontFamily:"'DM Mono', monospace", fontSize:22, fontWeight:500, lineHeight:1 }}>{fmt(elapsed)}</div>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'rgba(255,255,255,.4)', marginTop:2 }}>Elapsed</div>
            </div>
            {/* Recording pill */}
            {canManage && (
              <button
                onClick={() => setRecording(r => !r)}
                style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'7px 13px', borderRadius:999, border:'none', fontFamily:'inherit', fontSize:11.5, fontWeight:700, cursor:'pointer', background: recording ? FS.coral : 'rgba(255,255,255,.15)', color:'#fff', transition:'all .2s' }}
              >
                {recording ? '⏹ Stop recording' : '🎙 Record'}
              </button>
            )}
            {canManage && (
              <button onClick={endMeeting} style={{ background: FS.amber, border:'none', color: FS.navy, borderRadius:7, padding:'7px 15px', fontFamily:'inherit', fontSize:12, fontWeight:800, cursor:'pointer' }}>
                End &amp; Save
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── PREP HEADER ── light surface */}
      {isPrep && (
        <div style={{ flexShrink:0, background: FS.surface, borderBottom:`1px solid ${FS.border}`, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={() => navigate('/meetings')} style={{ background:'transparent', border:'none', color: FS.muted, fontSize:16, cursor:'pointer', padding:'0 6px 0 0', lineHeight:1 }}>←</button>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:4 }}>Meeting Prep</div>
              <div style={{ fontSize:17, fontWeight:800, letterSpacing:'-.01em', color: FS.text }}>{meeting.title}</div>
              <div style={{ fontSize:11.5, color: FS.muted, marginTop:3 }}>{dateLabel} · {timeRange}</div>
            </div>
          </div>
          {canManage && (
            <div style={{ display:'flex', gap:8 }}>
              <button style={{ padding:'8px 14px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                Preview &amp; export
              </button>
              <button onClick={startLive} style={{ padding:'8px 16px', border:'none', borderRadius:6, background: FS.coral, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                ● Start live
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── POST HEADER ── light surface */}
      {isPost && (
        <div style={{ flexShrink:0, background: FS.surface, borderBottom:`1px solid ${FS.border}`, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={() => navigate('/meetings')} style={{ background:'transparent', border:'none', color: FS.muted, fontSize:16, cursor:'pointer', padding:'0 6px 0 0', lineHeight:1 }}>←</button>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.sage, marginBottom:4 }}>✓ Meeting Complete</div>
              <div style={{ fontSize:17, fontWeight:800, letterSpacing:'-.01em', color: FS.text }}>{meeting.title}</div>
              <div style={{ fontSize:11.5, color: FS.muted, marginTop:3 }}>{dateLabel} · Duration: {fmt(elapsed)}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button style={{ padding:'8px 14px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              📤 Export PDF
            </button>
            {meeting.drive_url && (
              <button style={{ padding:'8px 14px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                ☁ Save to Drive
              </button>
            )}
            <button onClick={publishMinutes} disabled={saving} style={{ padding:'8px 14px', border:'none', borderRadius:6, background: FS.navy, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              {saving ? 'Saving…' : published ? '✓ Saved!' : 'Publish minutes →'}
            </button>
          </div>
        </div>
      )}

      {/* ── BODY: SIDEBAR + MAIN ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Sidebar */}
        <aside style={{ flex:'0 0 264px', background: FS.sidebarBg, borderRight:`1px solid ${FS.sidebarBd}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ flex:1, overflowY:'auto', padding:14 }}>

            {/* Calendar card */}
            <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'11px 13px', marginBottom:12, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:7, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                Calendar
                <span style={{ background: FS.sageL, color: FS.sage, borderRadius:999, padding:'2px 8px', fontSize:9 }}>Synced ✓</span>
              </div>
              <div style={{ fontSize:12.5, fontWeight:700, color: FS.text, marginBottom:2 }}>{dateLabel}</div>
              <div style={{ fontSize:11.5, color: FS.muted }}>{meeting.meeting_type ?? 'General'} meeting</div>
              {isLive && (
                <>
                  <div style={{ marginTop:8, height:3, background: FS.borderL, borderRadius:999, overflow:'hidden' }}>
                    <div style={{ width: timerPct, height:'100%', background: FS.navy, borderRadius:999, transition:'width .5s' }} />
                  </div>
                  <div style={{ fontSize:10, color: FS.muted, marginTop:4, display:'flex', justifyContent:'space-between' }}>
                    <span>{fmt(elapsed)} elapsed</span>
                    <span>90 min total</span>
                  </div>
                </>
              )}
            </div>

            {/* Agenda */}
            <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              Agenda
              <button style={{ fontFamily:'inherit', fontSize:10, fontWeight:700, color: FS.navy, border:'none', background:'none', cursor:'pointer', padding:0 }}>+ Add</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
              {agenda.length === 0 ? (
                <div style={{ fontSize:12, color: FS.xmuted, textAlign:'center', padding:'12px 0' }}>No agenda items</div>
              ) : agenda.map((item, i) => {
                const active = i === currentIdx
                return (
                  <div
                    key={item.id}
                    onClick={() => setCurrentIdx(i)}
                    style={{ display:'flex', alignItems:'flex-start', gap:9, padding:'9px 10px', borderRadius:8, border:`1px solid ${active ? FS.navyL : FS.border}`, background: active ? FS.navyGhost : FS.surface, cursor:'pointer', transition:'all .13s' }}
                  >
                    <div style={{ flexShrink:0, width:18, height:18, borderRadius:999, background: active ? FS.navy : FS.border, color: active ? '#fff' : FS.muted, fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', marginTop:1 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:700, color: active ? FS.navy : FS.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.title}</div>
                      {item.mins && <div style={{ fontSize:10, color: FS.muted, marginTop:1 }}>{item.mins} min</div>}
                    </div>
                    {active && isLive && (
                      <span style={{ flexShrink:0, width:6, height:6, borderRadius:999, background: FS.coral, marginTop:5, animation:'pulse 1.5s infinite', display:'inline-block' }} />
                    )}
                  </div>
                )
              })}
            </div>

            {isLive && currentIdx < agenda.length - 1 && (
              <button
                onClick={() => setCurrentIdx(i => i + 1)}
                style={{ width:'100%', padding:'8px', borderRadius:8, border:`1px solid ${FS.navy}`, background:'transparent', color: FS.navy, fontSize:11, fontWeight:600, cursor:'pointer', marginBottom:14 }}
              >
                Next item →
              </button>
            )}

            {/* Permissions */}
            <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'11px 13px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>Your permissions</div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {[
                  { label:'Edit minutes',     ok: canManage },
                  { label:'Manage agenda',    ok: canManage },
                  { label:'Delete meeting',   ok: role === 'super_admin' },
                  { label:'Manage attendees', ok: canManage },
                ].map(p => (
                  <div key={p.label} style={{ display:'flex', alignItems:'center', gap:7, fontSize:11 }}>
                    <span style={{ color: p.ok ? FS.sage : FS.coral, fontSize:12 }}>{p.ok ? '✓' : '✗'}</span>
                    <span style={{ color: p.ok ? FS.text : FS.xmuted, fontWeight:600 }}>{p.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:8, fontSize:10, color: FS.xmuted }}>Role: <strong style={{ color: FS.navy }}>{role}</strong></div>
            </div>

          </div>
        </aside>

        {/* Main content */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background: FS.bg }}>

          {/* Tab bar */}
          <div style={{ flexShrink:0, background: FS.surface, borderBottom:`1px solid ${FS.border}`, display:'flex', alignItems:'stretch', padding:'0 18px', gap:2 }}>
            {TABS.map(t => {
              const active = activeTab === t.id
              const badge  = t.id === 'actions' && actionBadge > 0 ? actionBadge : null
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'11px 13px', border:'none', background:'none', borderBottom:`2px solid ${active ? FS.navy : 'transparent'}`, fontFamily:'inherit', fontSize:12.5, fontWeight: active ? 700 : 500, color: active ? FS.navy : FS.muted, cursor:'pointer', whiteSpace:'nowrap', transition:'all .13s', marginBottom:-1 }}
                >
                  {t.icon} {t.label}
                  {badge && (
                    <span style={{ minWidth:16, height:16, borderRadius:999, background: FS.navyGhost, color: FS.navy, fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab contents */}
          <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>

            {/* MINUTES TAB */}
            {activeTab === 'minutes' && (
              <div style={{ flex:1, overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:14, animation:'fadein .18s ease' }}>

                {/* Current agenda item context card */}
                {currentItem && (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'12px 14px', boxShadow:'0 1px 3px rgba(0,0,0,.06)', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ flexShrink:0, width:28, height:28, borderRadius:999, background: FS.navy, color:'#fff', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {currentIdx + 1}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>{currentItem.title}</div>
                      <div style={{ fontSize:11, color: FS.muted, marginTop:1 }}>
                        Current agenda item{currentItem.mins ? ` · ${currentItem.mins} min allocated` : ''}
                      </div>
                    </div>
                    {isLive && (
                      <span style={{ fontSize:10, fontWeight:700, color: FS.coral, background: FS.coralL, borderRadius:999, padding:'3px 10px' }}>In progress</span>
                    )}
                  </div>
                )}

                {/* Discussion capture card */}
                <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden' }}>
                  <div style={{ padding:'11px 14px', borderBottom:`1px solid ${FS.borderL}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted }}>📝 Discussion</div>
                    <span style={{ fontSize:10, color: FS.sage, fontWeight:600 }}>✓ Auto-saving</span>
                  </div>
                  <textarea
                    value={minutesText}
                    onChange={e => setMinutesText(e.target.value)}
                    placeholder="Capture what's being discussed…"
                    rows={7}
                    style={{ width:'100%', padding:'12px 14px', border:'none', fontSize:13, color: FS.text, background:'transparent', fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box' }}
                  />
                </div>

                {/* Publish row */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  {published && <span style={{ fontSize:12, color: FS.sage, fontWeight:600 }}>✓ Minutes published</span>}
                  <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                    <button onClick={publishMinutes} disabled={saving} style={{ padding:'8px 16px', border:'none', borderRadius:6, background: FS.navy, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      {saving ? 'Saving…' : 'Publish minutes'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ACTIONS TAB */}
            {activeTab === 'actions' && (
              <div style={{ flex:1, overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:12, animation:'fadein .18s ease' }}>
                <ActionItemBridge
                  meetingId={meetingId}
                  departmentId={meeting.department_id}
                  onSaved={tasks => setActionBadge(n => n + tasks.length)}
                  onCancel={() => {}}
                />
              </div>
            )}

            {/* AUDIO TAB */}
            {activeTab === 'audio' && (
              <div style={{ flex:1, overflowY:'auto', padding:18, animation:'fadein .18s ease' }}>
                <div style={{ fontSize:12, color: FS.muted, marginBottom:16 }}>
                  {isLive ? 'Record from microphone · Deepgram transcription' : 'Post-meeting audio · MP3, WAV, M4A · max 25 MB'}
                </div>
                <AudioTranscriptionPanel
                  meetingId={meetingId}
                  departmentId={meeting.department_id}
                  canRecord={canManage && isLive}
                  onTranscriptionComplete={() => {}}
                  onActionItemsExtracted={items => { setActionBadge(n => n + items.length); setActiveTab('actions') }}
                />
              </div>
            )}

            {/* DOCS TAB */}
            {activeTab === 'docs' && (
              <div style={{ flex:1, overflowY:'auto', padding:18, animation:'fadein .18s ease' }}>
                <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:16 }}>Meeting Documents</div>
                {meeting.drive_url ? (
                  <a href={meeting.drive_url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderRadius:10, border:`1px solid ${FS.border}`, background: FS.surface, textDecoration:'none', color: FS.text, fontSize:13, fontWeight:600 }}>
                    <span style={{ fontSize:20 }}>📄</span>
                    <div>
                      <div>Drive documents</div>
                      <div style={{ fontSize:11, color: FS.muted, fontWeight:400 }}>Uploaded to Google Drive</div>
                    </div>
                    <span style={{ marginLeft:'auto', color: FS.purple, fontSize:12 }}>Open ↗</span>
                  </a>
                ) : (
                  <div style={{ padding:'48px 20px', textAlign:'center', color: FS.xmuted, fontSize:13 }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>📎</div>
                    No documents attached to this meeting.
                  </div>
                )}
              </div>
            )}

            {/* AI EXTRACT TAB */}
            {activeTab === 'ai' && (
              <div style={{ flex:1, overflowY:'auto', padding:18, animation:'fadein .18s ease' }}>
                <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:6 }}>AI Extract</div>
                <div style={{ fontSize:12, color: FS.muted, marginBottom:20 }}>Claude-powered · extracts decisions, action items, and key takeaways from transcription</div>
                {meeting.summary ? (
                  <div style={{ padding:'16px 20px', borderRadius:12, background: FS.surface, border:`1px solid ${FS.border}`, fontSize:13, color: FS.text, lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                    {meeting.summary}
                  </div>
                ) : (
                  <div style={{ textAlign:'center', padding:'48px 20px', color: FS.xmuted }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>⚡</div>
                    <div style={{ fontSize:13, marginBottom:8 }}>No AI summary yet.</div>
                    <div style={{ fontSize:12 }}>Record audio in the Audio tab, then use "Extract to minutes" to generate an AI summary.</div>
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
  return (
    <MeetingsProvider departmentId={null}>
      <MeetingDetailViewInner />
    </MeetingsProvider>
  )
}
