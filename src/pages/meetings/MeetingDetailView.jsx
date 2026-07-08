import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { MeetingsProvider } from '../../features/meetings/MeetingsContext'
import ActionItemBridge from '../../features/meetings/components/ActionItemBridge'
import AudioTranscriptionPanel from '../../features/meetings/components/AudioTranscriptionPanel'
import MeetingDocsTab from '../../features/meetings/components/MeetingDocsTab'
import MeetingSummaryEditor from '../../features/meetings/components/MeetingSummaryEditor'
import GenerateMeetingDocButton from '../../features/meetings/components/GenerateMeetingDocButton'
import { createTasksFromActionItems } from '../../features/meetings/lib/meetings'

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
  { id: 'minutes', icon: '📝', label: 'Minutes',    badge: null },
  { id: 'actions', icon: '🎯', label: 'Actions',    badge: 'actions' },
  { id: 'audio',   icon: '🎙️', label: 'Audio',      badge: null },
  { id: 'docs',    icon: '📎', label: 'Docs',       badge: 'docs' },
  { id: 'ai',      icon: '⚡', label: 'AI Extract', badge: null },
]

function MeetingDetailViewInner() {
  const { meetingId } = useParams()
  const navigate      = useNavigate()
  const { role, profile } = useAuth()

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
  const [decisionsText, setDecisionsText]       = useState('')
  const [nextStepsText, setNextStepsText]       = useState('')
  const [minutesPublished, setMinutesPublished] = useState(false)
  const [published, setPublished]               = useState(false)
  const [saving, setSaving]                     = useState(false)
  const [actionItems, setActionItems]           = useState([])
  const [showAddAction, setShowAddAction]       = useState(false)
  const [docsBadge, setDocsBadge]               = useState(0)
  const [aiExtracting, setAiExtracting]         = useState(false)
  const [aiResult, setAiResult]                 = useState(null)
  const [aiError, setAiError]                   = useState('')
  const [selectedAiActionItems, setSelectedAiActionItems] = useState(new Set())
  const [mergingAiActions, setMergingAiActions] = useState(false)
  const [aiMergeSuccess, setAiMergeSuccess]     = useState(false)
  const [editingTranscript, setEditingTranscript] = useState(false)
  const [editedTranscript, setEditedTranscript]   = useState('')
  const [savingTranscript, setSavingTranscript]   = useState(false)
  const [showRawTranscript, setShowRawTranscript] = useState(false)  // WIN 1: toggle polished/raw
  const [context, setContext]                     = useState('')      // WIN 2: meeting context
  const [contextChanged, setContextChanged]       = useState(false)

  const timerRef       = useRef(null)
  const startRef       = useRef(null)
  const totalSecs      = 90 * 60 // estimate 90 min for progress bar
  const cacheTimeoutRef = useRef(null)
  const [cacheStatus, setCacheStatus] = useState('') // empty, 'saving', 'saved'

  const isMobile  = useMediaQuery('(max-width: 640px)')
  const canManage = ['super_admin', 'dept_lead', 'ors'].includes(role)
  const isLive    = mode === 'live'
  const isPrep    = mode === 'prep'
  const isPost    = mode === 'post'

  // ── fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => { if (meetingId) { fetchMeeting(); fetchActionItems() } }, [meetingId])

  // ── auto-cache to localStorage (debounced) ─────────────────────────────────
  useEffect(() => {
    if (!meetingId) return
    const cacheKey = `meeting_draft_${meetingId}`
    clearTimeout(cacheTimeoutRef.current)
    setCacheStatus('saving')
    cacheTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(cacheKey, JSON.stringify({
        minutesText,
        decisionsText,
        nextStepsText,
        timestamp: Date.now(),
      }))
      setCacheStatus('saved')
      setTimeout(() => setCacheStatus(''), 2000)
    }, 500)
    return () => clearTimeout(cacheTimeoutRef.current)
  }, [minutesText, decisionsText, nextStepsText, meetingId])

  // ── load draft from cache on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!meetingId || !loading) return
    const cacheKey = `meeting_draft_${meetingId}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { minutesText: cM, decisionsText: cD, nextStepsText: cN } = JSON.parse(cached)
        // Only restore if DB didn't already load these (avoid overwriting fetched data)
        if (!minutesText && cM) setMinutesText(cM)
        if (!decisionsText && cD) setDecisionsText(cD)
        if (!nextStepsText && cN) setNextStepsText(cN)
      } catch {}
    }
  }, [loading, meetingId])

  async function fetchMeeting() {
    setLoading(true)
    try {
      let { data, error } = await supabase
        .from('meetings')
        .select(`
          id, title, department_id, date, meeting_type, agenda, minutes,
          decisions, next_steps, summary, polished_transcript, context, meeting_notes, doc_drive_url, doc_title,
          zoom_join_url, drive_url, status, started_at,
          created_by, created_at,
          agendas(id, title, agenda_items(id, segment, notes, duration_minutes, sort_order))
        `)
        .eq('id', meetingId)
        .single()
      // Fallback if new columns not yet migrated (decisions, next_steps, status, started_at)
      if (error?.message?.includes('column')) {
        const res = await supabase
          .from('meetings')
          .select(`
            id, title, department_id, date, meeting_type, agenda, minutes,
            summary, zoom_join_url, drive_url,
            created_by, created_at,
            agendas(id, title, agenda_items(id, segment, notes, duration_minutes, sort_order))
          `)
          .eq('id', meetingId)
          .single()
        data = res.data
        error = res.error
      }
      if (error) throw error

      setMeeting(data)
      if (data.minutes) setMinutesText(data.minutes)
      if (data.decisions) setDecisionsText(data.decisions)
      if (data.next_steps) setNextStepsText(data.next_steps)
      if (data.context) setContext(data.context)

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

  async function fetchActionItems() {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, source, assignee:users!assignee_id(id, name)')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true })
      if (!error && data) {
        setActionItems(data)
        setActionBadge(data.length)
      }
    } catch (e) {
      console.warn('Failed to fetch action items:', e)
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
    // Stop any active recording first
    setRecording(false)
    const { error } = await supabase
      .from('meetings').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', meetingId)
    if (error) { alert(error.message); return }
    setMode('post')
    setActiveTab('audio')
  }

  async function publishMinutes() {
    setSaving(true)
    const { error } = await supabase.from('meetings').update({
      minutes: minutesText,
      decisions: decisionsText,
      next_steps: nextStepsText,
    }).eq('id', meetingId)
    setSaving(false)
    if (error) { alert(error.message); return }
    localStorage.removeItem(`meeting_draft_${meetingId}`)
    setPublished(true)
    setTimeout(() => setPublished(false), 3000)
  }

  async function runAiExtraction() {
    const transcript = meeting?.summary
    if (!transcript) {
      setAiError('No transcript found. Upload and transcribe audio first, then come back here.')
      return
    }
    setAiExtracting(true)
    setAiError('')
    setAiResult(null)
    setSelectedAiActionItems(new Set())
    setAiMergeSuccess(false)
    try {
      const { data, error } = await supabase.functions.invoke('extract-meeting-data', {
        body: { transcript, context: context || '' }
      })
      if (error) throw error
      const extracted = data?.extracted ?? null
      setAiResult(extracted)
      if (extracted?.action_items?.length) {
        setSelectedAiActionItems(new Set(extracted.action_items.map((_, i) => i)))
      }
      // Save summary back to meeting
      if (extracted?.summary) {
        await supabase.from('meetings').update({ summary: extracted.summary }).eq('id', meetingId)
        setMeeting(m => ({ ...m, summary: extracted.summary }))
      }
      // Auto-populate minutes fields if empty
      if (extracted?.decisions?.length && !decisionsText) {
        const decisionStrings = extracted.decisions
          .map((d) => (typeof d === 'string' ? d : d?.decision ?? null))
          .filter((d) => typeof d === 'string' && d !== null)
        setDecisionsText(decisionStrings.join('\n• '))
      }
      if (extracted?.next_steps?.length && !nextStepsText) {
        setNextStepsText(extracted.next_steps.join('\n• '))
      }
    } catch (err) {
      setAiError(err.message || 'Extraction failed.')
    } finally {
      setAiExtracting(false)
    }
  }

  function toggleAiActionItem(i) {
    setSelectedAiActionItems((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  // Deliberately does NOT setActiveTab('actions') after a successful merge, unlike Path A
  // (AudioTranscriptionPanel.jsx's handleMerge, wired via onActionItemsExtracted). Staying on
  // this tab keeps the success banner visible for confirmation. Not an oversight — don't
  // "fix" this to match Path A without a conscious call to do so.
  async function handleAiActionItemsMerge() {
    if (!aiResult?.action_items?.length || !meeting?.department_id) return
    setMergingAiActions(true)
    setAiError('')
    try {
      const items = aiResult.action_items
        .filter((_, i) => selectedAiActionItems.has(i))
        .map((item) => ({
          title: item.title,
          assigneeId: null,
          dueDate: item.due_date ?? null,
          description: item.owner && item.owner !== 'TBD' ? `Owner: ${item.owner}` : null,
        }))
      if (!items.length) { setMergingAiActions(false); return }
      await createTasksFromActionItems(meetingId, meeting.department_id, items, profile?.id)
      setAiMergeSuccess(true)
      fetchActionItems()
    } catch (err) {
      setAiError(err.message || 'Failed to create tasks.')
    } finally {
      setMergingAiActions(false)
    }
  }

  async function togglePublishMinutes() {
    const newVal = !minutesPublished
    setMinutesPublished(newVal)
    await publishMinutes()
  }

  function avatarColor(name = '') {
    const colors = ['#4C2A92','#1B72E8','#16A34A','#E8A020','#F06449','#0891B2','#7C3AED','#DC2626']
    let h = 0
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
    return colors[Math.abs(h) % colors.length]
  }

  function initials(name = '') {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
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

      {/* ── UNIFIED HEADER ── */}
      <div style={{ flexShrink:0, background: isLive ? FS.navy : FS.surface, borderBottom: isLive ? 'none' : `1px solid ${FS.border}`, padding: isMobile ? '10px 14px' : '13px 20px', display:'flex', alignItems:'center', gap: isMobile ? 10 : 14, flexWrap:'wrap' }}>
        {/* Back + title */}
        <button onClick={() => navigate('/meetings')} style={{ background:'transparent', border:'none', color: isLive ? 'rgba(255,255,255,.4)' : FS.muted, fontSize:16, cursor:'pointer', padding:'0 6px 0 0', lineHeight:1, flexShrink:0 }}>←</button>

        {isLive && (
          <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(201,72,48,.18)', border:'1px solid rgba(201,72,48,.5)', color:'#FF9583', borderRadius:999, padding:'4px 11px', fontSize:10, fontWeight:700, letterSpacing:'.06em', flexShrink:0 }}>
            <span style={{ width:7, height:7, borderRadius:999, background:'#FF5A3C', animation:'pulse 1.5s infinite', display:'inline-block' }} />
            LIVE
          </span>
        )}

        {isPost && (
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.sage, flexShrink:0 }}>✓ Complete</span>
        )}

        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontSize:15, fontWeight:800, color: isLive ? '#fff' : FS.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{meeting.title}</div>
          <div style={{ fontSize:11, color: isLive ? 'rgba(255,255,255,.55)' : FS.muted, marginTop:1 }}>
            {isPrep ? 'Meeting Prep · ' : isPost ? `Duration: ${fmt(elapsed)} · ` : ''}{dateLabel}
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
          {/* Live: timer + record */}
          {isLive && (
            <>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:"'DM Mono', monospace", fontSize:22, fontWeight:500, lineHeight:1, color:'#fff' }}>{fmt(elapsed)}</div>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'rgba(255,255,255,.4)', marginTop:2 }}>Elapsed</div>
              </div>
              {canManage && (
                <button
                  onClick={() => { if (!recording) { setRecording(true); setActiveTab('audio') } else { setRecording(false) } }}
                  style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'7px 13px', borderRadius:999, border:'none', fontFamily:'inherit', fontSize:11.5, fontWeight:700, cursor:'pointer', background: recording ? FS.coral : 'rgba(255,255,255,.15)', color:'#fff', transition:'all .2s' }}
                >
                  {recording
                    ? <><span style={{ width:8, height:8, borderRadius:2, background:'#fff', display:'inline-block' }} /> Stop recording</>
                    : <><span style={{ width:8, height:8, borderRadius:'50%', background:'#FF5A3C', display:'inline-block', animation:'pulse 1.5s infinite' }} /> Record</>
                  }
                </button>
              )}
            </>
          )}

          {/* Post: export buttons */}
          {isPost && canManage && (
            <>
              <button style={{ padding:'7px 13px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                📤 Export PDF
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={publishMinutes} disabled={saving} style={{ padding:'7px 13px', border:'none', borderRadius:6, background: FS.navy, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  {saving ? 'Saving…' : published ? '✓ Saved!' : 'Publish minutes →'}
                </button>
                {cacheStatus && <span style={{ fontSize:10, color: FS.muted, opacity: cacheStatus === 'saved' ? 1 : 0.6 }}>
                  {cacheStatus === 'saving' ? '⏳ Auto-saving draft...' : cacheStatus === 'saved' ? '✓ Draft saved locally' : ''}
                </span>}
              </div>
            </>
          )}

          {/* Mode toggle pills — always visible for managers */}
          {canManage && (
            <div style={{ display:'inline-flex', borderRadius:999, border:`1px solid ${isLive ? 'rgba(255,255,255,.2)' : FS.border}`, overflow:'hidden', background: isLive ? 'rgba(255,255,255,.08)' : FS.surface }}>
              {[
                { id:'prep',  label:'Prep' },
                { id:'live',  label:'● Live' },
                { id:'post',  label:'Post' },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    if (m.id === mode) return
                    if (m.id === 'live') startLive()
                    else if (m.id === 'post') endMeeting()
                    // Can't go back to prep from live/post
                  }}
                  style={{
                    padding:'6px 13px', border:'none', fontFamily:'inherit', fontSize:11.5, fontWeight:700, cursor: m.id === mode ? 'default' : 'pointer',
                    background: m.id === mode
                      ? (m.id === 'live' ? FS.coral : isLive ? 'rgba(255,255,255,.2)' : FS.purple)
                      : 'transparent',
                    color: m.id === mode ? '#fff' : (isLive ? 'rgba(255,255,255,.5)' : FS.muted),
                    transition:'all .15s',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── BODY: SIDEBAR + MAIN ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Sidebar — hidden on mobile */}
        <aside style={{ flex:'0 0 264px', background: FS.sidebarBg, borderRight:`1px solid ${FS.sidebarBd}`, display: isMobile ? 'none' : 'flex', flexDirection:'column', overflow:'hidden' }}>
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
          <div style={{ flexShrink:0, background: FS.surface, borderBottom:`1px solid ${FS.border}`, display:'flex', alignItems:'stretch', padding: isMobile ? '0 8px' : '0 18px', gap:2, overflowX:'auto', WebkitOverflowScrolling:'touch', scrollbarWidth:'none' }}>
            {TABS.map(t => {
              const active = activeTab === t.id
              const badge  = t.badge === 'actions' && actionBadge > 0 ? actionBadge
                           : t.badge === 'docs' && docsBadge > 0 ? docsBadge
                           : null
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{ display:'flex', alignItems:'center', gap:5, padding: isMobile ? '10px 10px' : '11px 13px', border:'none', background:'none', borderBottom:`2px solid ${active ? FS.navy : 'transparent'}`, fontFamily:'inherit', fontSize: isMobile ? 12 : 12.5, fontWeight: active ? 700 : 500, color: active ? FS.navy : FS.muted, cursor:'pointer', whiteSpace:'nowrap', transition:'all .13s', marginBottom:-1, flexShrink:0 }}
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
              <div style={{ flex:1, overflowY:'auto', padding: isMobile ? 12 : 18, display:'flex', flexDirection:'column', gap: isMobile ? 10 : 14, animation:'fadein .18s ease' }}>

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

                {/* WIN 2: Meeting Context (prep mode only) */}
                {isPrep && canManage && (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'14px 16px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:4 }}>Meeting Context</div>
                    <div style={{ fontSize:11, color: FS.xmuted, marginBottom:8 }}>e.g. "Q3 planning", "API redesign" — helps AI extract better action items</div>
                    <textarea
                      value={context}
                      onChange={(e) => { setContext(e.target.value); setContextChanged(true) }}
                      onBlur={async () => {
                        if (!contextChanged) return
                        const { error } = await supabase.from('meetings').update({ context }).eq('id', meetingId)
                        if (!error) setContextChanged(false)
                      }}
                      placeholder="Add context to help AI extract better action items…"
                      rows={2}
                      style={{ width:'100%', padding:'10px 12px', border:`1px solid ${FS.border}`, borderRadius:8, fontSize:13, color: FS.text, fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box', background:'#fff' }}
                    />
                  </div>
                )}

                {/* 📝 Discussion */}
                <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden' }}>
                  <div style={{ padding:'11px 14px', borderBottom:`1px solid ${FS.borderL}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted }}>📝 Discussion</div>
                    <span style={{ fontSize:10, color: FS.sage, fontWeight:600 }}>✓ Auto-saving</span>
                  </div>
                  <textarea
                    value={minutesText}
                    onChange={e => setMinutesText(e.target.value)}
                    placeholder="Capture what's being discussed…"
                    rows={6}
                    style={{ width:'100%', padding:'12px 14px', border:'none', fontSize:13, color: FS.text, background:'transparent', fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box' }}
                  />
                </div>

                {/* ✅ Decisions Made */}
                <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden' }}>
                  <div style={{ padding:'11px 14px', borderBottom:`1px solid ${FS.borderL}` }}>
                    <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted }}>✅ Decisions Made</div>
                  </div>
                  <textarea
                    value={decisionsText}
                    onChange={e => setDecisionsText(e.target.value)}
                    placeholder="Key decisions reached in this meeting…"
                    rows={4}
                    style={{ width:'100%', padding:'12px 14px', border:'none', fontSize:13, color: FS.text, background:'transparent', fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box' }}
                  />
                </div>

                {/* ➡ Next Steps */}
                <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden' }}>
                  <div style={{ padding:'11px 14px', borderBottom:`1px solid ${FS.borderL}` }}>
                    <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted }}>➡ Next Steps</div>
                  </div>
                  <textarea
                    value={nextStepsText}
                    onChange={e => setNextStepsText(e.target.value)}
                    placeholder="Agreed next steps…"
                    rows={4}
                    style={{ width:'100%', padding:'12px 14px', border:'none', fontSize:13, color: FS.text, background:'transparent', fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box' }}
                  />
                </div>

                {/* Publish minutes toggle */}
                <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>Publish minutes</div>
                    <div style={{ fontSize:11, color: FS.muted, marginTop:2 }}>Share with all attendees automatically</div>
                  </div>
                  <button
                    onClick={publishMinutes}
                    disabled={saving}
                    style={{
                      position:'relative', width:44, height:24, borderRadius:999, border:'none', cursor:'pointer', transition:'background .2s',
                      background: published ? FS.sage : FS.border,
                    }}
                  >
                    <span style={{
                      position:'absolute', top:3, left: published ? 22 : 2, width:18, height:18, borderRadius:'50%',
                      background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)',
                    }} />
                  </button>
                </div>

                {published && <div style={{ fontSize:12, color: FS.sage, fontWeight:600 }}>✓ Minutes saved & published</div>}
              </div>
            )}

            {/* ACTIONS TAB */}
            {activeTab === 'actions' && (
              <div style={{ flex:1, overflowY:'auto', padding: isMobile ? 12 : 18, display:'flex', flexDirection:'column', gap: isMobile ? 8 : 12, animation:'fadein .18s ease' }}>
                {/* Header */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>
                    Action Items
                    <span style={{ fontSize:11, fontWeight:500, color: FS.muted, marginLeft:8 }}>— Manual + AI extracted</span>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => setShowAddAction(v => !v)}
                      style={{ padding:'7px 13px', border:'none', borderRadius:6, background: FS.purple, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}
                    >
                      + Add item
                    </button>
                  )}
                </div>

                {/* Inline add form */}
                {showAddAction && (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:14 }}>
                    <ActionItemBridge
                      meetingId={meetingId}
                      departmentId={meeting.department_id}
                      onSaved={tasks => { fetchActionItems(); setShowAddAction(false) }}
                      onCancel={() => setShowAddAction(false)}
                    />
                  </div>
                )}

                {/* Action item list */}
                {actionItems.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 0', color: FS.xmuted, fontSize:13 }}>
                    No action items yet. Add one above or extract from audio.
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {actionItems.map(task => {
                      const name = task.assignee?.name ?? ''
                      const bg = avatarColor(name)
                      const ini = initials(name)
                      const isDone = task.status === 'done' || task.status === 'completed'
                      const isInProgress = task.status === 'in_progress'
                      return (
                        <div key={task.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:10, border:`1px solid ${FS.border}`, background: FS.surface, boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={async () => {
                              const newStatus = isDone ? 'open' : 'done'
                              await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
                              setActionItems(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
                            }}
                            style={{ width:16, height:16, cursor:'pointer', accentColor: FS.purple, flexShrink:0 }}
                          />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: FS.text, textDecoration: isDone ? 'line-through' : 'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {task.title}
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3, fontSize:11, color: FS.muted }}>
                              {name && (
                                <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                                  <span style={{ width:20, height:20, borderRadius:'50%', background: bg, color:'#fff', fontSize:9, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{ini}</span>
                                  {name.split(' ')[0]}
                                </span>
                              )}
                              {task.due_date && <span>· Due {new Date(task.due_date).toLocaleDateString('en-CA', { month:'short', day:'numeric' })}</span>}
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
                            {task.source === 'ai' && (
                              <span style={{ fontSize:9, fontWeight:700, color: FS.purple, background:'rgba(76,42,146,.12)', borderRadius:999, padding:'2px 7px', letterSpacing:'.03em' }}>AI</span>
                            )}
                            <span style={{
                              fontSize:10.5, fontWeight:700, borderRadius:6, padding:'3px 9px',
                              background: isInProgress ? 'rgba(232,160,32,.15)' : isDone ? FS.sageL : 'rgba(0,0,0,.06)',
                              color: isInProgress ? FS.amber : isDone ? FS.sage : FS.muted,
                            }}>
                              {isInProgress ? 'In progress' : isDone ? 'Done' : 'New'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* AUDIO TAB */}
            {activeTab === 'audio' && (
              <div style={{ flex:1, overflowY:'auto', padding: isMobile ? 12 : 18, display:'flex', flexDirection:'column', gap: isMobile ? 12 : 16, animation:'fadein .18s ease' }}>

                {/* Live Recording */}
                {canManage && (
                  <AudioTranscriptionPanel
                    key={`record-${meetingId}`}
                    meetingId={meetingId}
                    departmentId={meeting.department_id}
                    canRecord={canManage}
                    meetingContext={context}
                    recordOnly
                    startImmediately={recording}
                    stopImmediately={!recording}
                    onRecordingChange={(isRec) => { if (!isRec) setRecording(false) }}
                    onTranscriptionComplete={({ transcript }) => setMeeting(m => ({ ...m, summary: transcript }))}
                    onActionItemsExtracted={() => { fetchActionItems(); setActiveTab('actions') }}
                  />
                )}

                {/* Upload */}
                <AudioTranscriptionPanel
                  key={`upload-${meetingId}`}
                  meetingId={meetingId}
                  departmentId={meeting.department_id}
                  canRecord={false}
                  meetingContext={context}
                  onTranscriptionComplete={({ transcript }) => setMeeting(m => ({ ...m, summary: transcript }))}
                  onActionItemsExtracted={() => { fetchActionItems(); setActiveTab('actions') }}
                />

                {/* Paste transcript */}
                <AudioTranscriptionPanel
                  key={`paste-${meetingId}`}
                  meetingId={meetingId}
                  departmentId={meeting.department_id}
                  canRecord={false}
                  meetingContext={context}
                  pasteOnly
                  onTranscriptionComplete={({ transcript }) => setMeeting(m => ({ ...m, summary: transcript }))}
                  onActionItemsExtracted={() => { fetchActionItems(); setActiveTab('actions') }}
                />

                {/* Saved transcript */}
                {meeting?.summary && (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ padding:'12px 16px', borderBottom:`1px solid ${FS.borderL}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>📄 Saved Transcript</div>
                        <div style={{ fontSize:11, color: FS.muted, marginTop:2 }}>
                          {meeting.polished_transcript ? 'AI-polished · ' : ''}Ready for AI extraction
                        </div>
                      </div>
                      {/* WIN 1: raw/polished toggle */}
                      {meeting.polished_transcript && (
                        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color: FS.muted, cursor:'pointer', flexShrink:0 }}>
                          <input
                            type="checkbox"
                            checked={showRawTranscript}
                            onChange={(e) => setShowRawTranscript(e.target.checked)}
                            style={{ accentColor: FS.purple }}
                          />
                          Show raw transcript
                        </label>
                      )}
                      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                        {!editingTranscript && (
                          <button
                            onClick={() => { setEditedTranscript(meeting.summary); setEditingTranscript(true) }}
                            style={{ padding:'7px 13px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.navy, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}
                          >
                            ✏️ Edit
                          </button>
                        )}
                        <button
                          onClick={() => setActiveTab('ai')}
                          style={{ padding:'7px 13px', border:'none', borderRadius:6, background: FS.purple, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}
                        >
                          ⚡ AI Extract →
                        </button>
                      </div>
                    </div>
                    {editingTranscript ? (
                      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                        <textarea
                          value={editedTranscript}
                          onChange={e => setEditedTranscript(e.target.value)}
                          rows={10}
                          style={{ width:'100%', padding:'12px 14px', border:`1px solid ${FS.border}`, borderRadius:8, fontSize:13, color: FS.text, fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.7, boxSizing:'border-box', background:'#fff' }}
                        />
                        <div style={{ display:'flex', gap:8 }}>
                          <button
                            disabled={savingTranscript}
                            onClick={async () => {
                              setSavingTranscript(true)
                              await supabase.from('meetings').update({ summary: editedTranscript }).eq('id', meetingId)
                              setMeeting(m => ({ ...m, summary: editedTranscript }))
                              setEditingTranscript(false)
                              setSavingTranscript(false)
                            }}
                            style={{ padding:'8px 16px', border:'none', borderRadius:6, background: FS.navy, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}
                          >
                            {savingTranscript ? 'Saving…' : '💾 Save changes'}
                          </button>
                          <button
                            onClick={() => setEditingTranscript(false)}
                            style={{ padding:'8px 16px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding:'14px 16px', maxHeight:240, overflowY:'auto' }}>
                        <p style={{ margin:0, fontSize:13, color: FS.text, lineHeight:1.8, whiteSpace:'pre-wrap' }}>
                          {showRawTranscript ? meeting.summary : (meeting.polished_transcript || meeting.summary)}
                        </p>
                      </div>
                    )}
                    {!editingTranscript && (
                      <div style={{ padding:'10px 16px', borderTop:`1px solid ${FS.borderL}` }}>
                        <button
                          onClick={() => { setMinutesText(t => t ? `${t}\n\n${meeting.summary}` : meeting.summary); setActiveTab('minutes') }}
                          style={{ padding:'7px 14px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.navy, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}
                        >
                          → Copy to Minutes
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Editable Summary & Key Points */}
                {(meeting?.meeting_notes || meeting?.summary) && (
                  <MeetingSummaryEditor
                    meetingId={meetingId}
                    initialSummary={meeting.summary}
                    initialNotes={meeting.meeting_notes}
                    onSave={(updated) => setMeeting(m => ({ ...m, meeting_notes: updated }))}
                  />
                )}

                {/* Generate & Upload Doc */}
                {meeting?.summary && (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'14px 16px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ fontSize:13, fontWeight:700, color: FS.text, marginBottom:4 }}>📄 Generate Meeting Minutes Doc</div>
                    <div style={{ fontSize:11, color: FS.muted, marginBottom:12 }}>
                      Creates a formatted Google Doc with transcript, summary, and action items — uploaded to Drive automatically.
                    </div>
                    <GenerateMeetingDocButton
                      meetingId={meetingId}
                      meeting={meeting}
                      actionItems={actionItems}
                      onSuccess={(result) => setMeeting(m => ({ ...m, doc_drive_url: result.docUrl, doc_title: result.docTitle }))}
                    />
                  </div>
                )}

              </div>
            )}

            {/* DOCS TAB */}
            {activeTab === 'docs' && (
              <MeetingDocsTab
                meetingId={meetingId}
                canUpload={canManage}
                onCountChange={setDocsBadge}
              />
            )}

            {/* AI EXTRACT TAB */}
            {activeTab === 'ai' && (
              <div style={{ flex:1, overflowY:'auto', padding: isMobile ? 12 : 18, display:'flex', flexDirection:'column', gap: isMobile ? 10 : 14, animation:'fadein .18s ease' }}>
                <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                  <div style={{ fontSize:15, fontWeight:700, color: FS.text, marginBottom:4 }}>⚡ AI Extraction</div>
                  <div style={{ fontSize:12, color: FS.muted, marginBottom:14 }}>
                    Claude reads the meeting transcript and extracts decisions, action items, and key takeaways.
                  </div>
                  {!meeting?.summary && !aiResult && (
                    <div style={{ padding:'12px 14px', borderRadius:8, background:'rgba(176,168,154,.12)', border:`1px solid ${FS.borderL}`, fontSize:12, color: FS.muted, marginBottom:14 }}>
                      No transcript yet. Go to the <button onClick={() => setActiveTab('audio')} style={{ background:'none', border:'none', color: FS.purple, fontWeight:700, cursor:'pointer', padding:0, fontSize:12 }}>Audio tab</button> to upload and transcribe a recording first.
                    </div>
                  )}
                  <button
                    onClick={runAiExtraction}
                    disabled={aiExtracting || !meeting?.summary}
                    style={{ width:'100%', padding:'12px 0', border:'none', borderRadius:8, background: aiExtracting || !meeting?.summary ? FS.xmuted : FS.purple, color:'#fff', fontFamily:'inherit', fontSize:14, fontWeight:700, cursor: aiExtracting || !meeting?.summary ? 'not-allowed' : 'pointer', transition:'background .15s' }}
                  >
                    {aiExtracting ? '⏳ Extracting…' : '⚡ Run AI extraction'}
                  </button>
                  {meeting?.summary && (
                    <div style={{ fontSize:11, color: FS.xmuted, textAlign:'center', marginTop:8 }}>
                      Transcript found · Powered by Claude
                    </div>
                  )}
                  {aiError && (
                    <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, background:'#FEE8E6', color:'#C73B2B', fontSize:12, borderLeft:'3px solid #C73B2B' }}>
                      {aiError}
                    </div>
                  )}
                </div>

                {/* Extraction results */}
                {aiResult && (
                  <>
                    {aiResult.summary && (
                      <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>Summary</div>
                        <div style={{ fontSize:13, color: FS.text, lineHeight:1.7 }}>{aiResult.summary}</div>
                      </div>
                    )}
                    {aiResult.decisions?.length > 0 && (
                      <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>Decisions extracted</div>
                        <ul style={{ margin:0, paddingLeft:18 }}>
                          {aiResult.decisions.map((d, i) => (
                            <li key={i} style={{ fontSize:13, color: FS.text, lineHeight:1.6, marginBottom:4 }}>
                              {typeof d === 'string' ? d : d.decision}
                              {typeof d !== 'string' && d.context && (
                                <div style={{ fontSize:11, color: FS.muted, marginTop:2 }}>{d.context}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                        <button onClick={() => { setDecisionsText(aiResult.decisions.map(d => typeof d === 'string' ? d : d.decision).join('\n• ')); setActiveTab('minutes') }} style={{ marginTop:12, padding:'7px 14px', border:'none', borderRadius:6, background: FS.navy, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          → Copy to Minutes
                        </button>
                      </div>
                    )}
                    {aiResult.action_items?.length > 0 && (
                      <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>Action items extracted — select to add to board</div>
                        {aiResult.action_items.map((item, i) => (
                          <label
                            key={i}
                            onClick={() => toggleAiActionItem(i)}
                            style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 10px', background: FS.surface, borderRadius:6, border:`1px solid ${selectedAiActionItems.has(i) ? FS.purple : FS.borderL}`, cursor:'pointer', marginBottom:6 }}
                          >
                            <input type="checkbox" checked={selectedAiActionItems.has(i)} onChange={() => toggleAiActionItem(i)} style={{ marginTop:2, cursor:'pointer', accentColor: FS.purple }} />
                            <div>
                              <div style={{ fontSize:13, fontWeight:600, color: FS.text }}>{typeof item === 'string' ? item : item.title}</div>
                              {typeof item !== 'string' && (
                                <div style={{ fontSize:11, color: FS.muted, marginTop:2 }}>
                                  Owner: {item.owner || 'TBD'}{item.due_date ? ` · Due ${item.due_date}` : ''}
                                </div>
                              )}
                            </div>
                          </label>
                        ))}

                        {aiMergeSuccess && (
                          <div style={{ marginTop:12, padding:'9px 14px', borderRadius:8, background: FS.sageL, color: FS.sage, fontSize:12, fontWeight:600, borderLeft:`3px solid ${FS.sage}` }}>
                            ✅ {selectedAiActionItems.size} task{selectedAiActionItems.size !== 1 ? 's' : ''} added to the Actions board.
                          </div>
                        )}

                        <div style={{ display:'flex', gap:8, marginTop:12 }}>
                          {!aiMergeSuccess && (
                            <button
                              onClick={handleAiActionItemsMerge}
                              disabled={selectedAiActionItems.size === 0 || mergingAiActions}
                              style={{ padding:'7px 14px', border:'none', borderRadius:6, background: FS.purple, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor: selectedAiActionItems.size === 0 || mergingAiActions ? 'not-allowed' : 'pointer', opacity: selectedAiActionItems.size === 0 || mergingAiActions ? 0.6 : 1 }}
                            >
                              {mergingAiActions ? '⏳ Adding...' : `✓ Add ${selectedAiActionItems.size} item${selectedAiActionItems.size !== 1 ? 's' : ''} to board`}
                            </button>
                          )}
                          <button onClick={() => setActiveTab('actions')} style={{ padding:'7px 14px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.navy, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                            → View Actions tab
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Previously saved transcript */}
                {!aiResult && meeting?.summary && (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>Saved transcript</div>
                    <div style={{ fontSize:13, color: FS.text, lineHeight:1.7, whiteSpace:'pre-wrap', maxHeight:300, overflowY:'auto' }}>{meeting.summary}</div>
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
