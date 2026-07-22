import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useToast } from '../../context/ToastContext'
import { hasSpaceRole } from '../../lib/permissions.js'
import { MeetingsProvider } from '../../features/meetings/MeetingsContext'
import ActionItemBridge from '../../features/meetings/components/ActionItemBridge'
import AudioTranscriptionPanel from '../../features/meetings/components/AudioTranscriptionPanel'
import MeetingDocsTab from '../../features/meetings/components/MeetingDocsTab'
import MeetingSummaryEditor from '../../features/meetings/components/MeetingSummaryEditor'
import GenerateMeetingDocButton from '../../features/meetings/components/GenerateMeetingDocButton'
import MeetingShareModal from '../../features/meetings/components/MeetingShareModal'
import { createTasksFromActionItems, setNotesSharedWithAttendee, editRecurringMeeting } from '../../features/meetings/lib/meetings'
import { resolveAssignment, getOrgDepartments, getOrgUsers } from '../../features/meetings/lib/ownerMatching'
import { getOpenItemsByMeeting, createOpenItems, updateOpenItem, updateOpenItemStatus, deleteOpenItem, convertOpenItemToTask } from '../../features/meetings/lib/openItems'
import { getCategoryStatusId, STATUS_CATEGORIES } from '../../lib/taskStatuses'
import { useExtractionStatus } from '../../features/meetings/hooks/useExtractionStatus'
import { autoSelectOpenItems } from '../../features/meetings/lib/applyExtraction'
import { syncFlockInteractionForMeeting } from '../../features/meetings/lib/flockLink'
import FlockContactPicker from '../../features/meetings/components/FlockContactPicker'
import MeetingAgendaEditor from '../../features/meetings/components/MeetingAgendaEditor'
import { saveAgendaItemsForMeeting } from '../../features/meetings/lib/agendaSync'

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

// For a <input type="datetime-local"> value, which has no timezone —
// this renders the date/time as the browser's local zone, matching how
// `new Date(meeting.date)` is displayed everywhere else on this page.
function toLocalDateTimeInput(value) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function MeetingDetailViewInner() {
  const { meetingId } = useParams()
  const navigate      = useNavigate()
  const { role, profile } = useAuth()
  const { showToast } = useToast()
  const extraction = useExtractionStatus(meetingId)

  const [meeting, setMeeting]   = useState(null)
  const [agenda, setAgenda]     = useState([])
  const [editingAgenda, setEditingAgenda] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [fetchErr, setFetchErr] = useState(null)

  const [elapsed, setElapsed]                   = useState(0)
  const [recording, setRecording]               = useState(false)
  const [currentIdx, setCurrentIdx]             = useState(0)
  const [activeTab, setActiveTab]               = useState('minutes')
  const [actionBadge, setActionBadge]           = useState(0)
  const [minutesText, setMinutesText]           = useState('')
  const [decisionsText, setDecisionsText]       = useState('')
  const [nextStepsText, setNextStepsText]       = useState('')
  const [minutesSaveStatus, setMinutesSaveStatus] = useState('idle') // idle | saving | saved | error
  const [actionItems, setActionItems]           = useState([])
  const [showAddAction, setShowAddAction]       = useState(false)
  const [docsBadge, setDocsBadge]               = useState(0)
  const [aiExtracting, setAiExtracting]         = useState(false)
  const [aiResult, setAiResult]                 = useState(null)
  const [aiError, setAiError]                   = useState('')
  const [selectedAiActionItems, setSelectedAiActionItems] = useState(new Set())
  const [mergingAiActions, setMergingAiActions] = useState(false)
  const [aiMergeSuccess, setAiMergeSuccess]     = useState(false)
  const [editableAiItems, setEditableAiItems]   = useState([])
  const [orgUsers, setOrgUsers]                 = useState([])
  const [orgDepartments, setOrgDepartments]     = useState([])
  const [editingTranscript, setEditingTranscript] = useState(false)
  const [editedTranscript, setEditedTranscript]   = useState('')
  const [savingTranscript, setSavingTranscript]   = useState(false)
  const [showRawTranscript, setShowRawTranscript] = useState(false)  // WIN 1: toggle polished/raw
  const [exportingPdf, setExportingPdf]           = useState(false)
  const [context, setContext]                     = useState('')      // WIN 2: meeting context
  const [contextChanged, setContextChanged]       = useState(false)
  const [editingTitle, setEditingTitle]           = useState(false)
  const [titleDraft, setTitleDraft]               = useState('')
  const [savingTitle, setSavingTitle]             = useState(false)
  const [editingDate, setEditingDate]             = useState(false)
  const [dateDraft, setDateDraft]                 = useState('')
  const [savingDate, setSavingDate]               = useState(false)
  const [pendingDateISO, setPendingDateISO]       = useState(null) // set while the recurrence-scope choice is showing
  const [savingVisibility, setSavingVisibility]   = useState(false)
  const [shareModalOpen, setShareModalOpen]       = useState(false)

  // open items state
  const [openItems, setOpenItems]                       = useState([])
  const [showAddOpenItem, setShowAddOpenItem]           = useState(false)
  const [newOpenItemText, setNewOpenItemText]           = useState('')
  const [newOpenItemType, setNewOpenItemType]           = useState('exploration')
  const [convertingOpenItem, setConvertingOpenItem]     = useState(null)
  const [convertAssignee, setConvertAssignee]           = useState('')
  const [convertDueDate, setConvertDueDate]             = useState('')
  const [editingOpenItemId, setEditingOpenItemId]       = useState(null)
  const [editOpenItemText, setEditOpenItemText]         = useState('')
  const [editOpenItemType, setEditOpenItemType]         = useState('')
  const [savingOpenItem, setSavingOpenItem]             = useState(false)
  // AI extract tab: open items confirmation
  const [selectedAiOpenItems, setSelectedAiOpenItems]   = useState(new Set())
  const [mergingAiOpenItems, setMergingAiOpenItems]     = useState(false)
  const [aiOpenItemsMergeSuccess, setAiOpenItemsMergeSuccess] = useState(false)
  // meeting_minutes record (AI-extracted notes)
  const [minutesRecord, setMinutesRecord]               = useState(null)
  const [togglingPrivacy, setTogglingPrivacy]           = useState(false)
  const [sharingNotesId, setSharingNotesId]             = useState(null)

  // attendees edit
  const [editingAttendees, setEditingAttendees]         = useState(false)
  const [attendeeDraft, setAttendeeDraft]               = useState([])
  const [savingAttendees, setSavingAttendees]           = useState(false)
  const [attendeesError, setAttendeesError]             = useState(null)

  const timerRef       = useRef(null)
  const startRef       = useRef(null)
  const totalSecs      = 90 * 60 // estimate 90 min for progress bar
  const cacheTimeoutRef = useRef(null)
  const minutesDbTimeoutRef = useRef(null)

  const isMobile  = useMediaQuery('(max-width: 640px)')
  // ORS identity is a space_roles grant (Phase 3) — role === 'ors' no longer exists.
  // pastor/regional_secretary included: this is the actual gate behind live
  // recording (canRecord={canManage} below) — MeetingRecordTabs.jsx has its
  // own separate (already-fixed) copy of this check, but this page's gate is
  // the one users actually hit when opening a meeting.
  const canManage = ['super_admin', 'dept_lead', 'pastor', 'regional_secretary'].includes((role ?? '').toLowerCase()) ||
                    hasSpaceRole(profile, null, 'ors') ||
                    hasSpaceRole(profile, null, 'dept_lead')
  // Mirrors the meetings_update RLS policy: creator can always edit their own
  // meeting, regardless of current visibility (private or published).
  const canEditVisibility = canManage || meeting?.created_by === profile?.id
  // Live audio recording is available to everyone who can view this meeting —
  // not just leadership. Persisting the recorded/uploaded summary for
  // non-editors is enforced narrowly at the DB layer (see migration
  // 20270723000006), which restricts non-editors to only ever writing the
  // `summary` column. Every other canManage-gated action is unaffected and
  // stays leadership/creator-only.
  const canRecord = true
  // One-on-one notes are hidden from invited attendees by default — they see
  // the meeting on their calendar (via allowed_viewers) but not its notes
  // unless the creator explicitly shares. Creator/canManage always sees notes.
  const isOneOnOne = meeting?.meeting_type === '1_on_1_meeting'
  const isNotesCreator = meeting?.created_by === profile?.id
  const canSeeNotes = !isOneOnOne || canManage || isNotesCreator ||
                      (meeting?.notes_shared_with ?? []).includes(profile?.id)
  const isLive    = meeting?.status === 'in_progress'
  const isPost    = meeting?.status === 'completed' || meeting?.status === 'cancelled'
  const isPrep    = !isLive && !isPost

  // ── fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => { if (meetingId) { fetchMeeting(); fetchActionItems() } }, [meetingId])
  // Open items follow the same visibility as meeting notes (canSeeNotes) —
  // gated on `meeting` being loaded first, since canSeeNotes defaults to
  // true (!isOneOnOne) while meeting is still null, before we actually know
  // whether this is a 1-on-1 that should be hidden.
  useEffect(() => { if (meeting && canSeeNotes) fetchOpenItems() }, [meeting?.id, canSeeNotes])

  // ── AI extraction: durable result bridged from useExtractionStatus ─────────
  // extraction.result is the source of truth (survives navigation/refresh —
  // WS1/WS3). Always sync the review-UI state so a completed extraction is
  // visible whether it just finished or the user is returning to it later.
  const prevExtractionStatusRef = useRef('idle')
  useEffect(() => {
    setAiExtracting(extraction.status === 'processing')
    if (extraction.status === 'failed' && extraction.error) setAiError(extraction.error)
  }, [extraction.status, extraction.error])

  useEffect(() => {
    if (!extraction.result) return
    const extracted = extraction.result
    setAiResult(extracted)
    if (extracted.action_items?.length) {
      setSelectedAiActionItems(new Set(extracted.action_items.map((_, i) => i)))
      ;(async () => {
        let users = orgUsers
        let depts = orgDepartments
        if (!users.length || !depts.length) {
          try {
            const [u, d] = await Promise.all([getOrgUsers(), getOrgDepartments()])
            users = u; depts = d
            setOrgUsers(u); setOrgDepartments(d)
          } catch { /* directory fetch is best-effort */ }
        }
        const directory = { departments: depts, users }
        setEditableAiItems(extracted.action_items.map((raw) => {
          const item = typeof raw === 'string' ? { title: raw, owner: '', due_date: '' } : raw
          const resolved = resolveAssignment(item, directory)
          return {
            title: item.title || '',
            owner: item.owner || '',
            due_date: item.due_date || '',
            assigneeId: resolved.assigneeId || '',
            departmentId: resolved.departmentId || meeting?.department_id || '',
          }
        }))
      })()
    }
    if (extracted.open_items?.length) setSelectedAiOpenItems(autoSelectOpenItems(extracted.open_items))

    // Auto-populate minutes/notes only on a genuine fresh completion (status
    // transitioning into 'complete' during this session), not on cold mount
    // of an already-completed extraction from a prior session — otherwise
    // this would race fetchMeeting() and could clobber already-saved manual
    // edits with stale raw-extraction text before the real saved values load.
    const justCompleted = prevExtractionStatusRef.current !== 'complete' && extraction.status === 'complete'
    prevExtractionStatusRef.current = extraction.status
    if (!justCompleted || loading) return

    if (extracted.summary && !meeting?.meeting_notes) {
      supabase.from('meetings').update({ meeting_notes: extracted.summary }).eq('id', meetingId)
        .then(({ error: notesErr }) => { if (!notesErr) setMeeting((m) => ({ ...m, meeting_notes: extracted.summary })) })
    }
    if (extracted.detailed_notes && !minutesText) setMinutesText(extracted.detailed_notes)
    if (extracted.decisions?.length && !decisionsText) {
      const decisionStrings = extracted.decisions
        .map((d) => (typeof d === 'string' ? d : d?.decision ?? null))
        .filter((d) => typeof d === 'string' && d !== null)
      setDecisionsText(decisionStrings.join('\n• '))
    }
    if (extracted.next_steps?.length && !nextStepsText) setNextStepsText(extracted.next_steps.join('\n• '))
  }, [extraction.result])

  // ── auto-cache to localStorage (debounced, crash-safety net only) ──────────
  useEffect(() => {
    if (!meetingId) return
    const cacheKey = `meeting_draft_${meetingId}`
    clearTimeout(cacheTimeoutRef.current)
    cacheTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(cacheKey, JSON.stringify({
        minutesText,
        decisionsText,
        nextStepsText,
        timestamp: Date.now(),
      }))
    }, 500)
    return () => clearTimeout(cacheTimeoutRef.current)
  }, [minutesText, decisionsText, nextStepsText, meetingId])

  // ── autosave minutes/decisions/next-steps to the database (debounced) ──────
  // Replaces the old manual "Publish minutes" button. Gated on
  // canEditVisibility so it never attempts a write the RLS trigger
  // (enforce_meetings_summary_only_update) would reject for non-editors —
  // matches the same predicate the UI already uses to show/hide edit
  // affordances. Skipped while `loading` so it can't fire on initial mount
  // before fetchMeeting() has populated minutesText/etc from the DB.
  useEffect(() => {
    if (!meetingId || loading || !canEditVisibility) return
    clearTimeout(minutesDbTimeoutRef.current)
    minutesDbTimeoutRef.current = setTimeout(async () => {
      setMinutesSaveStatus('saving')
      const { error } = await supabase.from('meetings').update({
        minutes: minutesText,
        decisions: decisionsText,
        next_steps: nextStepsText,
      }).eq('id', meetingId)
      if (error) {
        setMinutesSaveStatus('error')
        setTimeout(() => setMinutesSaveStatus('idle'), 5000)
      } else {
        localStorage.removeItem(`meeting_draft_${meetingId}`)
        setMinutesSaveStatus('saved')
        setTimeout(() => setMinutesSaveStatus('idle'), 3000)
      }
    }, 2500)
    return () => clearTimeout(minutesDbTimeoutRef.current)
  }, [minutesText, decisionsText, nextStepsText, meetingId, canEditVisibility, loading])

  // ── cache AI extraction results ───────────────────────────────────────────
  useEffect(() => {
    if (!meetingId || !aiResult) return
    const aiCacheKey = `meeting_ai_${meetingId}`
    localStorage.setItem(aiCacheKey, JSON.stringify({
      aiResult,
      editableAiItems,
      timestamp: Date.now(),
    }))
  }, [aiResult, editableAiItems, meetingId])

  // ── load draft from cache on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!meetingId || !loading) return
    const cacheKey = `meeting_draft_${meetingId}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { minutesText: cM, decisionsText: cD, nextStepsText: cN } = JSON.parse(cached)
        if (!minutesText && cM) setMinutesText(cM)
        if (!decisionsText && cD) setDecisionsText(cD)
        if (!nextStepsText && cN) setNextStepsText(cN)
      } catch {}
    }
    // Restore AI extraction results
    const aiCacheKey = `meeting_ai_${meetingId}`
    const aiCached = localStorage.getItem(aiCacheKey)
    if (aiCached) {
      try {
        const parsed = JSON.parse(aiCached)
        const hoursSince = (Date.now() - parsed.timestamp) / 3600000
        if (hoursSince < 72 && parsed.aiResult) {
          setAiResult(parsed.aiResult)
          if (parsed.editableAiItems?.length) setEditableAiItems(parsed.editableAiItems)
          if (parsed.aiResult.action_items?.length) {
            setSelectedAiActionItems(new Set(parsed.aiResult.action_items.map((_, i) => i)))
          }
          if (parsed.aiResult.open_items?.length) {
            const autoSelected = new Set()
            parsed.aiResult.open_items.forEach((item, i) => {
              if ((item.confidence_score ?? 0) >= 0.80) autoSelected.add(i)
            })
            setSelectedAiOpenItems(autoSelected)
          }
        } else {
          localStorage.removeItem(aiCacheKey)
        }
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
          zoom_join_url, drive_url, status, started_at, visibility, allowed_viewers,
          notes_shared_with, recurrence_id, series_instance_num,
          extraction_result, extraction_status, extraction_started_at, extraction_completed_at, extraction_error,
          flock_contact_id,
          created_by, created_at,
          agendas(id, title, agenda_items(id, segment, notes, duration_minutes, sort_order)),
          attendance:meeting_attendance(user_id, status, attendee:users(id, name))
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
      setTitleDraft(data.title ?? '')

      // fetch meeting_minutes record for AI notes privacy toggle
      const { data: mm } = await supabase
        .from('meeting_minutes')
        .select('id, is_private')
        .eq('meeting_id', meetingId)
        .maybeSingle()
      setMinutesRecord(mm ?? null)
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
        .select('id, title, status, department_id, due_date, source, assignee:users!assignee_id(id, name)')
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

  async function fetchOpenItems() {
    try {
      const data = await getOpenItemsByMeeting(meetingId)
      setOpenItems(data)
    } catch (e) {
      console.warn('Failed to fetch open items:', e)
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
    if (error) { showToast(`Couldn't start the meeting: ${error.message}`, { tone: 'error' }); return }
    startRef.current = Date.now()
    setElapsed(0)
    setMeeting(m => ({ ...m, status: 'in_progress', started_at: now }))
    setActiveTab('minutes')
  }

  async function endMeeting() {
    if (!window.confirm('End this meeting and save progress?')) return
    setRecording(false)
    const ended_at = new Date().toISOString()
    const { error } = await supabase
      .from('meetings').update({ status: 'completed', ended_at }).eq('id', meetingId)
    if (error) { showToast(`Couldn't end the meeting: ${error.message}`, { tone: 'error' }); return }
    const updated = { ...meeting, status: 'completed', ended_at }
    setMeeting(updated)
    if (updated.meeting_type === '1_on_1_meeting') {
      syncFlockInteractionForMeeting(updated, profile?.id).catch(() => {})
    }
  }

  async function exportPdf() {
    setExportingPdf(true)
    try {
      const { generateMinutesPDF, generateMinutesPDFFilename } = await import('../../lib/meetings/pdfGeneration')
      const splitLines = (text) => (text || '')
        .split('\n')
        .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean)
      const blob = await generateMinutesPDF({
        summary: meeting?.meeting_notes || minutesText || '',
        decisions: splitLines(decisionsText),
        nextSteps: splitLines(nextStepsText),
        detailedNotes: minutesText || '',
        actionItems: actionItems.map((t) => ({
          action: t.title,
          owner: t.assignee?.name || 'Unassigned',
          dueDate: t.due_date,
          status: t.statusName || t.status_definition?.name || '',
        })),
        openItems: openItems.map((item) => ({
          text: item.text || item.title || '',
          type: item.type || 'exploration',
          status: item.status || 'open',
        })),
        agenda: agenda.map((item) => ({
          title: item.title || '',
          mins: item.mins || null,
        })),
        attendees: (meeting?.attendance || []).map((a) => ({
          name: a.attendee?.name || 'Unknown',
          status: a.status || 'present',
        })),
      }, meeting)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = generateMinutesPDFFilename(meeting)
      a.click()
      URL.revokeObjectURL(url)
      showToast('Minutes PDF downloaded', { tone: 'success' })
    } catch (err) {
      showToast(`PDF export failed: ${err.message}`, { tone: 'error' })
    } finally {
      setExportingPdf(false)
    }
  }

  function runAiExtraction() {
    const transcript = meeting?.summary
    if (!transcript) {
      setAiError('No transcript found. Upload and transcribe audio first, then come back here.')
      return
    }
    setAiError('')
    setAiResult(null)
    setSelectedAiActionItems(new Set())
    setAiMergeSuccess(false)
    setSelectedAiOpenItems(new Set())
    setAiOpenItemsMergeSuccess(false)
    // Optimistic — the realtime subscription in useExtractionStatus confirms
    // shortly after via the edge function's own 'processing' write. Not
    // awaited: the edge function persists its result server-side (WS1), so
    // the caller doesn't need to stay mounted for the result to land — the
    // bridging effect above picks it up whenever it arrives.
    setAiExtracting(true)
    supabase.functions.invoke('extract-meeting-data', {
      body: { transcript, context: context || '', meetingId },
    }).then(({ error }) => {
      if (error) {
        setAiExtracting(false)
        setAiError(error.message || 'Extraction failed.')
      }
    }).catch((err) => {
      setAiExtracting(false)
      setAiError(err.message || 'Extraction failed.')
    })
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
    if (!editableAiItems.length) return
    setMergingAiActions(true)
    setAiError('')
    try {
      const fallbackDept = meeting?.department_id
      const items = editableAiItems
        .filter((_, i) => selectedAiActionItems.has(i))
        .map((item) => ({
          title: item.title,
          assigneeId: item.assigneeId || null,
          departmentId: item.departmentId || fallbackDept,
          dueDate: item.due_date || null,
          description: item.owner && item.owner !== 'TBD' && !item.assigneeId ? `Owner: ${item.owner}` : null,
        }))
      if (!items.length) { setMergingAiActions(false); return }
      await createTasksFromActionItems(meetingId, fallbackDept, items, profile?.id)
      setAiMergeSuccess(true)
      fetchActionItems()
    } catch (err) {
      setAiError(err.message || 'Failed to create tasks.')
    } finally {
      setMergingAiActions(false)
    }
  }

  function toggleAiOpenItem(i) {
    setSelectedAiOpenItems((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function handleAiOpenItemsMerge() {
    if (!aiResult?.open_items?.length) return
    setMergingAiOpenItems(true)
    try {
      const items = aiResult.open_items
        .filter((_, i) => selectedAiOpenItems.has(i))
        .map((item) => ({
          item_text: item.item_text,
          item_type: item.item_type || 'exploration',
          transcript_excerpt: item.transcript_excerpt || null,
          confidence_score: item.confidence_score ?? null,
        }))
      if (!items.length) { setMergingAiOpenItems(false); return }
      await createOpenItems(meetingId, meeting?.department_id, items, profile?.id)
      setAiOpenItemsMergeSuccess(true)
      fetchOpenItems()
    } catch (err) {
      setAiError(err.message || 'Failed to save open items.')
    } finally {
      setMergingAiOpenItems(false)
    }
  }

  async function handleAddOpenItem() {
    if (!newOpenItemText.trim()) return
    try {
      await createOpenItems(meetingId, meeting?.department_id, [{
        item_text: newOpenItemText.trim(),
        item_type: newOpenItemType,
      }], profile?.id)
      setNewOpenItemText('')
      setNewOpenItemType('exploration')
      setShowAddOpenItem(false)
      fetchOpenItems()
    } catch (err) {
      console.warn('Failed to add open item:', err)
    }
  }

  async function handleOpenItemStatusChange(itemId, newStatus) {
    try {
      await updateOpenItemStatus(itemId, newStatus)
      setOpenItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, status: newStatus } : item
      ))
    } catch (err) {
      console.warn('Failed to update open item status:', err)
    }
  }

  async function handleDeleteOpenItem(itemId) {
    try {
      await deleteOpenItem(itemId)
      setOpenItems(prev => prev.filter(item => item.id !== itemId))
    } catch (err) {
      console.warn('Failed to delete open item:', err)
    }
  }

  function startEditOpenItem(item) {
    setEditingOpenItemId(item.id)
    setEditOpenItemText(item.item_text)
    setEditOpenItemType(item.item_type)
  }

  async function saveEditOpenItem(itemId) {
    setSavingOpenItem(true)
    try {
      await updateOpenItem(itemId, { item_text: editOpenItemText, item_type: editOpenItemType })
      setOpenItems(prev => prev.map(it =>
        it.id === itemId ? { ...it, item_text: editOpenItemText, item_type: editOpenItemType } : it
      ))
      setEditingOpenItemId(null)
    } catch (err) {
      console.warn('Failed to update open item:', err)
    } finally {
      setSavingOpenItem(false)
    }
  }

  async function saveAttendees() {
    setSavingAttendees(true)
    setAttendeesError(null)
    try {
      const { error } = await supabase.rpc('set_meeting_attendance', {
        p_meeting_id: meetingId,
        p_user_ids: attendeeDraft,
      })
      if (error) throw error

      // Only sync local state from the DB — and only close the editor — on
      // success. On failure, leave attendeeDraft/editingAttendees alone so
      // the user's in-progress edit isn't lost.
      const { data } = await supabase
        .from('meeting_attendance')
        .select('user_id, status, attendee:users(id, name)')
        .eq('meeting_id', meetingId)
      setMeeting(m => ({ ...m, attendance: data ?? [] }))
      setEditingAttendees(false)
    } catch (err) {
      setAttendeesError(err.message || 'Failed to save attendees.')
    } finally {
      setSavingAttendees(false)
    }
  }

  async function handleConvertOpenItem() {
    if (!convertingOpenItem) return
    try {
      await convertOpenItemToTask(convertingOpenItem, {
        assigneeId: convertAssignee || null,
        dueDate: convertDueDate || null,
        spaceId: meeting?.department_id || null,
      })
      setConvertingOpenItem(null)
      setConvertAssignee('')
      setConvertDueDate('')
      fetchOpenItems()
      fetchActionItems()
    } catch (err) {
      console.warn('Failed to convert open item:', err)
    }
  }

  function startTitleEdit() {
    setTitleDraft(meeting?.title ?? '')
    setEditingTitle(true)
  }

  function cancelTitleEdit() {
    setTitleDraft(meeting?.title ?? '')
    setEditingTitle(false)
  }

  async function saveTitle() {
    const nextTitle = titleDraft.trim()
    if (!nextTitle) {
      showToast('Meeting title cannot be empty.', { tone: 'error' })
      return
    }
    if (nextTitle === meeting?.title) {
      setEditingTitle(false)
      return
    }

    setSavingTitle(true)
    const { error } = await supabase
      .from('meetings')
      .update({ title: nextTitle })
      .eq('id', meetingId)
    setSavingTitle(false)

    if (error) {
      showToast(`Couldn't rename the meeting: ${error.message}`, { tone: 'error' })
      return
    }

    setMeeting((current) => ({ ...current, title: nextTitle }))
    setTitleDraft(nextTitle)
    setEditingTitle(false)
    showToast('Meeting renamed.', { tone: 'success' })
  }

  function startDateEdit() {
    setDateDraft(toLocalDateTimeInput(meeting?.date))
    setEditingDate(true)
  }

  function cancelDateEdit() {
    setDateDraft(toLocalDateTimeInput(meeting?.date))
    setEditingDate(false)
    setPendingDateISO(null)
  }

  // For a recurring meeting, a time change needs to ask "this occurrence
  // only" or "this and every future occurrence" before it's applied — a
  // plain meeting just saves immediately.
  function saveDate() {
    if (!dateDraft) {
      showToast('Meeting date is required.', { tone: 'error' })
      return
    }
    const nextISO = new Date(dateDraft).toISOString()
    if (nextISO === new Date(meeting?.date).toISOString()) {
      setEditingDate(false)
      return
    }
    if (meeting?.recurrence_id) {
      setPendingDateISO(nextISO)
    } else {
      commitDateChange(nextISO, 'this')
    }
  }

  async function commitDateChange(nextISO, scope) {
    setSavingDate(true)
    setPendingDateISO(null)
    try {
      if (meeting?.recurrence_id) {
        await editRecurringMeeting(meetingId, { date: nextISO }, scope)
      } else {
        const { error } = await supabase.from('meetings').update({ date: nextISO }).eq('id', meetingId)
        if (error) throw error
      }
      setMeeting((current) => ({ ...current, date: nextISO }))
      setEditingDate(false)
      showToast(
        scope === 'this' ? 'Meeting rescheduled.' : 'Meeting time updated for this and future occurrences.',
        { tone: 'success' },
      )
    } catch (err) {
      showToast(`Couldn't reschedule the meeting: ${err.message}`, { tone: 'error' })
    } finally {
      setSavingDate(false)
    }
  }

  // Visibility (private/published) is editable any time, not just before the
  // first publish — the RLS policy already permits the creator/managers to
  // update the meeting regardless of its current visibility.
  async function toggleVisibility() {
    const nextVisibility = meeting?.visibility === 'private' ? 'published' : 'private'
    setSavingVisibility(true)
    const { error } = await supabase
      .from('meetings')
      .update({ visibility: nextVisibility })
      .eq('id', meetingId)
    setSavingVisibility(false)

    if (error) {
      showToast(`Couldn't update visibility: ${error.message}`, { tone: 'error' })
      return
    }

    setMeeting((current) => ({ ...current, visibility: nextVisibility }))
    showToast(nextVisibility === 'private' ? 'Meeting is now private.' : 'Meeting is now published.', { tone: 'success' })
  }

  // Notes visibility is separate from meeting visibility: an invited attendee
  // of a one-on-one can see the meeting on their calendar without seeing its
  // notes until the creator shares them explicitly.
  async function toggleNotesShare(userId, currentlyShared) {
    setSharingNotesId(userId)
    try {
      const next = await setNotesSharedWithAttendee(meetingId, userId, !currentlyShared)
      setMeeting((current) => ({ ...current, notes_shared_with: next }))
    } catch (err) {
      showToast(`Couldn't update notes sharing: ${err.message}`, { tone: 'error' })
    } finally {
      setSharingNotesId(null)
    }
  }

  async function handleAgendaItemsChange(editorItems) {
    // Optimistic local update so the (unrelated) live-navigation list above
    // reflects edits immediately; mins/id are re-derived after the DB round
    // trip so `id` stays a real agenda_items id (needed for the `key` prop
    // and for the sort_order this list already relies on for navigation).
    setAgenda(editorItems.map((item, i) => ({ id: `pending-${i}`, title: item.segment, mins: item.duration })))
    try {
      await saveAgendaItemsForMeeting(meeting, editorItems, profile?.id)
      await fetchMeeting()
    } catch (err) {
      showToast(`Couldn't save agenda: ${err.message}`, { tone: 'error' })
    }
  }

  async function handleFlockContactChange(contactId) {
    const { error } = await supabase.from('meetings').update({ flock_contact_id: contactId }).eq('id', meetingId)
    if (error) { showToast(`Couldn't link Flock contact: ${error.message}`, { tone: 'error' }); return }
    setMeeting((m) => ({ ...m, flock_contact_id: contactId }))
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
          {editingTitle ? (
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    saveTitle()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelTitleEdit()
                  }
                }}
                disabled={savingTitle}
                autoFocus
                aria-label="Meeting title"
                style={{
                  minWidth: 0,
                  flex: '1 1 260px',
                  maxWidth: '100%',
                  fontSize: 15,
                  fontWeight: 800,
                  color: FS.text,
                  border: `1px solid ${FS.border}`,
                  borderRadius: 8,
                  padding: '7px 10px',
                  background: '#fff',
                  outline: 'none',
                }}
              />
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <button
                  type="button"
                  onClick={saveTitle}
                  disabled={savingTitle}
                  style={{ padding:'7px 12px', border:'none', borderRadius:6, background: FS.purple, color:'#fff', fontFamily:'inherit', fontSize:11.5, fontWeight:700, cursor: savingTitle ? 'wait' : 'pointer', opacity: savingTitle ? 0.7 : 1 }}
                >
                  {savingTitle ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelTitleEdit}
                  disabled={savingTitle}
                  style={{ padding:'7px 12px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:11.5, fontWeight:700, cursor: savingTitle ? 'default' : 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
              <div style={{ fontSize:15, fontWeight:800, color: isLive ? '#fff' : FS.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{meeting.title}</div>
              {canManage && !isLive && (
                <button
                  type="button"
                  onClick={startTitleEdit}
                  style={{ flexShrink:0, padding:'4px 8px', border:`1px solid ${FS.border}`, borderRadius:999, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:11, fontWeight:700, cursor:'pointer' }}
                >
                  Rename
                </button>
              )}
              {canEditVisibility && !isLive && (
                <button
                  type="button"
                  onClick={toggleVisibility}
                  disabled={savingVisibility}
                  title={meeting.visibility === 'private'
                    ? 'Private — only you and admins can see this by default. Use Share to add specific people. Click to publish.'
                    : 'Published — visible to your department. Click to make private.'}
                  style={{
                    flexShrink:0,
                    display:'inline-flex',
                    alignItems:'center',
                    gap:4,
                    padding:'4px 8px',
                    border:`1px solid ${FS.border}`,
                    borderRadius:999,
                    background: meeting.visibility === 'private' ? 'rgba(76,42,146,.08)' : FS.surface,
                    color: meeting.visibility === 'private' ? FS.purple : FS.muted,
                    fontFamily:'inherit',
                    fontSize:11,
                    fontWeight:700,
                    cursor: savingVisibility ? 'wait' : 'pointer',
                    opacity: savingVisibility ? 0.7 : 1,
                  }}
                >
                  {meeting.visibility === 'private' ? '🔒 Private' : '🔓 Published'}
                </button>
              )}
              {canEditVisibility && !isLive && meeting.visibility === 'private' && (
                <button
                  type="button"
                  onClick={() => setShareModalOpen(true)}
                  style={{
                    flexShrink:0,
                    display:'inline-flex',
                    alignItems:'center',
                    gap:4,
                    padding:'4px 8px',
                    border:`1px solid ${FS.border}`,
                    borderRadius:999,
                    background: FS.surface,
                    color: FS.muted,
                    fontFamily:'inherit',
                    fontSize:11,
                    fontWeight:700,
                    cursor:'pointer',
                  }}
                >
                  👥 Share{meeting.allowed_viewers?.length ? ` (${meeting.allowed_viewers.length})` : ''}
                </button>
              )}
            </div>
          )}
          <div style={{ fontSize:11, color: isLive ? 'rgba(255,255,255,.55)' : FS.muted, marginTop:1 }}>
            {isPost ? `Duration: ${fmt(elapsed)} · ` : ''}{dateLabel}
            {meeting.recurrence_id && meeting.series_instance_num ? ` · 🔁 Meeting #${meeting.series_instance_num} in series` : ''}
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
              {canRecord && (
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
              <button
                onClick={exportPdf}
                disabled={exportingPdf}
                style={{ padding:'7px 13px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor: exportingPdf ? 'wait' : 'pointer', opacity: exportingPdf ? 0.7 : 1 }}
              >
                {exportingPdf ? '⏳ Exporting…' : '📤 Export PDF'}
              </button>
              {canEditVisibility && (
                <span style={{ fontSize:10, color: FS.muted, opacity: minutesSaveStatus === 'saved' ? 1 : 0.7 }}>
                  {minutesSaveStatus === 'saving' ? '⏳ Saving…'
                    : minutesSaveStatus === 'saved' ? '✓ Saved'
                    : minutesSaveStatus === 'error' ? '⚠ Save failed — retrying'
                    : 'Auto-saves as you type'}
                </span>
              )}
            </>
          )}

          {canManage && isPrep && (
            <button
              onClick={startLive}
              style={{ padding:'7px 14px', border:'none', borderRadius:6, background: FS.coral, color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}
            >
              ● Start meeting
            </button>
          )}
          {canManage && isLive && (
            <button
              onClick={endMeeting}
              style={{ padding:'7px 14px', border:`1px solid rgba(255,255,255,.3)`, borderRadius:6, background:'rgba(255,255,255,.12)', color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}
            >
              ■ End meeting
            </button>
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
              {editingDate ? (
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:2 }}>
                  <input
                    type="datetime-local"
                    value={dateDraft}
                    onChange={(e) => setDateDraft(e.target.value)}
                    disabled={savingDate}
                    autoFocus
                    aria-label="Meeting date and time"
                    style={{ fontSize:12.5, fontWeight:700, color: FS.text, border:`1px solid ${FS.border}`, borderRadius:6, padding:'5px 7px', background:'#fff', outline:'none', fontFamily:'inherit' }}
                  />
                  {pendingDateISO ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'8px 9px', borderRadius:6, background: FS.navyGhost, border:`1px solid ${FS.borderL}` }}>
                      <div style={{ fontSize:10.5, color: FS.muted, marginBottom:2 }}>This is part of a recurring series. Apply the new time to:</div>
                      <button type="button" disabled={savingDate} onClick={() => commitDateChange(pendingDateISO, 'this')} style={{ textAlign:'left', padding:'6px 8px', border:'none', borderRadius:5, background:'#fff', color: FS.text, fontFamily:'inherit', fontSize:11.5, fontWeight:600, cursor: savingDate ? 'wait' : 'pointer' }}>
                        This meeting only
                      </button>
                      <button type="button" disabled={savingDate} onClick={() => commitDateChange(pendingDateISO, 'future')} style={{ textAlign:'left', padding:'6px 8px', border:'none', borderRadius:5, background:'#fff', color: FS.text, fontFamily:'inherit', fontSize:11.5, fontWeight:600, cursor: savingDate ? 'wait' : 'pointer' }}>
                        This and following meetings
                      </button>
                      <button type="button" disabled={savingDate} onClick={cancelDateEdit} style={{ textAlign:'left', padding:'6px 8px', border:'none', borderRadius:5, background:'transparent', color: FS.muted, fontFamily:'inherit', fontSize:11.5, fontWeight:600, cursor:'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:6 }}>
                      <button type="button" onClick={saveDate} disabled={savingDate} style={{ padding:'5px 10px', border:'none', borderRadius:6, background: FS.purple, color:'#fff', fontFamily:'inherit', fontSize:11, fontWeight:700, cursor: savingDate ? 'wait' : 'pointer', opacity: savingDate ? 0.7 : 1 }}>
                        {savingDate ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" onClick={cancelDateEdit} disabled={savingDate} style={{ padding:'5px 10px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:11, fontWeight:700, cursor: savingDate ? 'default' : 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color: FS.text }}>{dateLabel}</div>
                  {canManage && !isLive && meeting.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={startDateEdit}
                      title="Reschedule"
                      style={{ flexShrink:0, padding:'2px 7px', border:`1px solid ${FS.border}`, borderRadius:999, background: FS.surface, color: FS.muted, fontFamily:'inherit', fontSize:10, fontWeight:700, cursor:'pointer' }}
                    >
                      Reschedule
                    </button>
                  )}
                </div>
              )}
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
              {canManage && (
                <button
                  onClick={() => setEditingAgenda((v) => !v)}
                  style={{ fontFamily:'inherit', fontSize:10, fontWeight:700, color: FS.navy, border:'none', background:'none', cursor:'pointer', padding:0 }}
                >
                  {editingAgenda ? 'Done' : agenda.length === 0 ? '+ Add' : 'Edit'}
                </button>
              )}
            </div>

            {editingAgenda ? (
              <div style={{ marginBottom:14 }}>
                <MeetingAgendaEditor
                  items={agenda.map((item) => ({ segment: item.title, duration: item.mins || 15 }))}
                  onChange={handleAgendaItemsChange}
                />
              </div>
            ) : (
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
            )}

            {isLive && currentIdx < agenda.length - 1 && (
              <button
                onClick={() => setCurrentIdx(i => i + 1)}
                style={{ width:'100%', padding:'8px', borderRadius:8, border:`1px solid ${FS.navy}`, background:'transparent', color: FS.navy, fontSize:11, fontWeight:600, cursor:'pointer', marginBottom:14 }}
              >
                Next item →
              </button>
            )}

            {/* Attendees */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                Attendees
                {canManage && !editingAttendees && (
                  <button
                    onClick={() => {
                      setAttendeeDraft((meeting?.attendance ?? []).map(a => a.user_id))
                      if (!orgUsers.length) getOrgUsers().then(u => setOrgUsers(u)).catch(() => {})
                      setAttendeesError(null)
                      setEditingAttendees(true)
                    }}
                    style={{ fontFamily:'inherit', fontSize:10, fontWeight:700, color: FS.navy, border:'none', background:'none', cursor:'pointer', padding:0 }}
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingAttendees ? (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {attendeesError && (
                    <div style={{ fontSize:11, color: FS.coral, background: FS.coralL, borderRadius:6, padding:'6px 8px' }}>
                      {attendeesError}
                    </div>
                  )}
                  <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:160, overflowY:'auto' }}>
                    {orgUsers.map(u => (
                      <label key={u.id} style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, color: FS.text, cursor:'pointer' }}>
                        <input
                          type="checkbox"
                          checked={attendeeDraft.includes(u.id)}
                          onChange={e => setAttendeeDraft(prev => e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))}
                        />
                        {u.name}
                      </label>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={saveAttendees} disabled={savingAttendees} style={{ flex:1, padding:'5px 0', border:'none', borderRadius:6, background: FS.navy, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                      {savingAttendees ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingAttendees(false); setAttendeesError(null) }} style={{ flex:1, padding:'5px 0', border:`1px solid ${FS.border}`, borderRadius:6, background:'transparent', color: FS.muted, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (meeting?.attendance ?? []).length === 0 ? (
                <div style={{ fontSize:12, color: FS.xmuted }}>No attendees recorded</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {(meeting?.attendance ?? []).map(a => (
                    <div key={a.user_id} style={{ fontSize:12, color: FS.text }}>{a.attendee?.name ?? a.user_id}</div>
                  ))}
                </div>
              )}
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

                {/* Meeting Context */}
                {canManage && (
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

                {/* One-on-one: link to a Flock CRM contact (creator only — Flock RLS is pastor_id = auth.uid()) */}
                {isOneOnOne && isNotesCreator && (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'14px 16px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>🐑 Flock CRM contact</div>
                    <FlockContactPicker
                      value={meeting.flock_contact_id}
                      onChange={handleFlockContactChange}
                      style={{ width:'100%', padding:'8px 10px', border:`1px solid ${FS.border}`, borderRadius:8, fontSize:13, color: FS.text, fontFamily:'inherit', background:'#fff' }}
                    />
                    <div style={{ fontSize:11, color: FS.muted, marginTop:6 }}>When this meeting ends, it's logged as an interaction for the linked contact.</div>
                  </div>
                )}

                {/* One-on-one: share notes with attendees (creator/managers only) */}
                {isOneOnOne && (canManage || isNotesCreator) && (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'14px 16px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>🔒 Notes hidden by default — share with</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {(meeting.attendance ?? []).filter((a) => a.user_id !== profile?.id).map((a) => {
                        const shared = (meeting.notes_shared_with ?? []).includes(a.user_id)
                        return (
                          <div key={a.user_id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 8px', borderRadius:8, border:`1px solid ${FS.borderL}` }}>
                            <span style={{ fontSize:13, color: FS.text, fontWeight:600 }}>{a.attendee?.name ?? 'Unknown'}</span>
                            <button
                              type="button"
                              onClick={() => toggleNotesShare(a.user_id, shared)}
                              disabled={sharingNotesId === a.user_id}
                              style={{
                                padding:'5px 12px', borderRadius:999,
                                border: shared ? 'none' : `1px solid ${FS.border}`,
                                background: shared ? FS.sageL : FS.surface,
                                color: shared ? FS.sage : FS.muted,
                                fontFamily:'inherit', fontSize:11, fontWeight:700,
                                cursor: sharingNotesId === a.user_id ? 'wait' : 'pointer',
                                opacity: sharingNotesId === a.user_id ? 0.6 : 1,
                              }}
                            >
                              {shared ? '✓ Shared' : 'Share notes'}
                            </button>
                          </div>
                        )
                      })}
                      {(meeting.attendance ?? []).filter((a) => a.user_id !== profile?.id).length === 0 && (
                        <div style={{ fontSize:12, color: FS.xmuted }}>No other attendees invited yet.</div>
                      )}
                    </div>
                  </div>
                )}

                {canSeeNotes ? (
                  <>
                    {/* 📝 Discussion */}
                    <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden' }}>
                      <div style={{ padding:'11px 14px', borderBottom:`1px solid ${FS.borderL}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted }}>📝 Discussion</div>
                        <span style={{ fontSize:10, color: minutesSaveStatus === 'error' ? FS.coral : FS.sage, fontWeight:600 }}>
                          {minutesSaveStatus === 'saving' ? '⏳ Saving…'
                            : minutesSaveStatus === 'saved' ? '✓ Saved'
                            : minutesSaveStatus === 'error' ? '⚠ Save failed'
                            : canEditVisibility ? '✓ Auto-saving' : ''}
                        </span>
                      </div>
                      <textarea
                        value={minutesText}
                        onChange={e => setMinutesText(e.target.value)}
                        placeholder="Capture what's being discussed…"
                        rows={6}
                        disabled={!canEditVisibility}
                        style={{ width:'100%', padding:'12px 14px', border:'none', fontSize:13, color: FS.text, background: canEditVisibility ? 'transparent' : FS.surface, fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box' }}
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
                        disabled={!canEditVisibility}
                        style={{ width:'100%', padding:'12px 14px', border:'none', fontSize:13, color: FS.text, background: canEditVisibility ? 'transparent' : FS.surface, fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box' }}
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
                        disabled={!canEditVisibility}
                        style={{ width:'100%', padding:'12px 14px', border:'none', fontSize:13, color: FS.text, background: canEditVisibility ? 'transparent' : FS.surface, fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box' }}
                      />
                    </div>

                    <div style={{ fontSize:11, color: FS.muted, textAlign:'right' }}>
                      {minutesSaveStatus === 'saving' ? '⏳ Saving…'
                        : minutesSaveStatus === 'saved' ? '✓ Saved'
                        : minutesSaveStatus === 'error' ? '⚠ Save failed — retrying'
                        : 'Auto-saves as you type'}
                    </div>
                  </>
                ) : (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'24px 16px', textAlign:'center', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>🔒</div>
                    <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>Notes hidden by creator</div>
                    <div style={{ fontSize:12, color: FS.muted, marginTop:4 }}>The organizer hasn't shared notes from this meeting with you yet.</div>
                  </div>
                )}
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
                              const nextCategory = isDone ? STATUS_CATEGORIES.OPEN : STATUS_CATEGORIES.COMPLETED
                              const statusId = await getCategoryStatusId({ departmentId: task.department_id, category: nextCategory })
                              if (!statusId) return
                              const { error } = await supabase.from('tasks').update({ status_id: statusId }).eq('id', task.id)
                              if (error) return
                              const newStatus = isDone ? 'open' : 'done'
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
                            {task.source === 'meeting' && (
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

                {/* ── Open Items Section (same visibility as notes — canSeeNotes) ── */}
                {canSeeNotes ? (
                <div style={{ marginTop: 24 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>
                      Open Discussion Items
                      {openItems.length > 0 && <span style={{ fontSize:11, fontWeight:500, color: FS.muted, marginLeft:8 }}>({openItems.length})</span>}
                    </div>
                    {canManage && (
                      <button
                        onClick={() => setShowAddOpenItem(v => !v)}
                        style={{ padding:'7px 13px', border:'none', borderRadius:6, background: '#2D8653', color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}
                      >
                        + Add item
                      </button>
                    )}
                  </div>

                  {showAddOpenItem && (
                    <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:14, marginBottom: 10 }}>
                      <input
                        value={newOpenItemText}
                        onChange={e => setNewOpenItemText(e.target.value)}
                        placeholder="Describe the open item..."
                        style={{ width:'100%', padding:'8px 10px', border:`1px solid ${FS.border}`, borderRadius:6, fontSize:13, fontFamily:'inherit', marginBottom:8, boxSizing:'border-box' }}
                      />
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <select
                          value={newOpenItemType}
                          onChange={e => setNewOpenItemType(e.target.value)}
                          style={{ padding:'6px 8px', border:`1px solid ${FS.border}`, borderRadius:6, fontSize:12, fontFamily:'inherit', background:'#fff' }}
                        >
                          <option value="question">Question</option>
                          <option value="exploration">Exploration</option>
                          <option value="blocker">Blocker</option>
                          <option value="decision_point">Decision Point</option>
                          <option value="future_consideration">Future Consideration</option>
                        </select>
                        <button onClick={handleAddOpenItem} style={{ padding:'6px 14px', border:'none', borderRadius:6, background:'#2D8653', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                        <button onClick={() => setShowAddOpenItem(false)} style={{ padding:'6px 14px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.navy, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {openItems.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'20px 0', color: FS.xmuted, fontSize:13 }}>
                      No open items yet. Add one above or extract from audio.
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {openItems.map(item => {
                        const typeLabels = { question: '❓', exploration: '🔍', blocker: '🚫', decision_point: '⚖️', future_consideration: '💡' }
                        const statusColors = { open: { bg: 'rgba(0,0,0,.06)', color: FS.muted, label: 'Open' }, in_progress: { bg: 'rgba(232,160,32,.15)', color: FS.amber, label: 'In Progress' }, resolved: { bg: FS.sageL, color: FS.sage, label: 'Resolved' } }
                        const sc = statusColors[item.status] || statusColors.open
                        return (
                          <div key={item.id} style={{ padding:'11px 14px', borderRadius:10, border:`1px solid ${FS.border}`, background: FS.surface, boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
                            <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                              {editingOpenItemId === item.id ? (
                                <select
                                  value={editOpenItemType}
                                  onChange={e => setEditOpenItemType(e.target.value)}
                                  style={{ fontSize:13, border:`1px solid ${FS.border}`, borderRadius:6, padding:'2px 4px', fontFamily:'inherit', flexShrink:0 }}
                                >
                                  <option value="question">❓ Question</option>
                                  <option value="exploration">🔍 Exploration</option>
                                  <option value="blocker">🚫 Blocker</option>
                                  <option value="decision_point">⚖️ Decision</option>
                                  <option value="future_consideration">💡 Future</option>
                                </select>
                              ) : (
                                <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>{typeLabels[item.item_type] || '📌'}</span>
                              )}
                              <div style={{ flex:1, minWidth:0 }}>
                                {editingOpenItemId === item.id ? (
                                  <input
                                    autoFocus
                                    value={editOpenItemText}
                                    onChange={e => setEditOpenItemText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEditOpenItem(item.id); if (e.key === 'Escape') setEditingOpenItemId(null) }}
                                    style={{ width:'100%', fontSize:13, fontWeight:600, border:`1px solid ${FS.border}`, borderRadius:6, padding:'4px 8px', fontFamily:'inherit', color: FS.text }}
                                  />
                                ) : (
                                  <div style={{ fontSize:13, fontWeight:600, color: FS.text }}>{item.item_text}</div>
                                )}
                                {item.transcript_excerpt && editingOpenItemId !== item.id && (
                                  <div style={{ fontSize:11, color: FS.muted, marginTop:4, fontStyle:'italic' }}>
                                    "{item.transcript_excerpt.slice(0, 100)}{item.transcript_excerpt.length > 100 ? '…' : ''}"
                                  </div>
                                )}
                                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6, flexWrap:'wrap' }}>
                                  {editingOpenItemId === item.id ? (
                                    <>
                                      <button onClick={() => saveEditOpenItem(item.id)} disabled={savingOpenItem} style={{ padding:'3px 10px', border:'none', borderRadius:6, fontSize:11, fontWeight:700, background: FS.sage, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
                                        {savingOpenItem ? '…' : 'Save'}
                                      </button>
                                      <button onClick={() => setEditingOpenItemId(null)} style={{ padding:'3px 10px', border:`1px solid ${FS.border}`, borderRadius:6, fontSize:11, fontWeight:600, background:'transparent', color: FS.muted, cursor:'pointer', fontFamily:'inherit' }}>
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <select
                                        value={item.status}
                                        onChange={e => handleOpenItemStatusChange(item.id, e.target.value)}
                                        style={{ padding:'3px 8px', border:`1px solid ${FS.border}`, borderRadius:6, fontSize:11, fontWeight:600, background: sc.bg, color: sc.color, cursor:'pointer', fontFamily:'inherit' }}
                                      >
                                        <option value="open">Open</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="resolved">Resolved</option>
                                      </select>
                                      {canManage && (
                                        <button
                                          onClick={() => startEditOpenItem(item)}
                                          style={{ padding:'3px 10px', border:`1px solid ${FS.border}`, borderRadius:6, fontSize:11, fontWeight:600, background:'#fff', color: FS.navy, cursor:'pointer', fontFamily:'inherit' }}
                                        >
                                          Edit
                                        </button>
                                      )}
                                      {!item.converted_to_task_id && (
                                        <button
                                          onClick={async () => {
                                            setConvertingOpenItem(item); setConvertAssignee(''); setConvertDueDate('')
                                            if (!orgUsers.length) {
                                              try {
                                                const [u, d] = await Promise.all([getOrgUsers(), getOrgDepartments()])
                                                setOrgUsers(u); setOrgDepartments(d)
                                              } catch {}
                                            }
                                          }}
                                          style={{ padding:'3px 10px', border:`1px solid ${FS.border}`, borderRadius:6, fontSize:11, fontWeight:600, background:'#fff', color: FS.purple, cursor:'pointer', fontFamily:'inherit' }}
                                        >
                                          Convert to Task
                                        </button>
                                      )}
                                      {item.converted_to_task_id && (
                                        <span style={{ fontSize:10, fontWeight:700, color: FS.sage, background: FS.sageL, borderRadius:999, padding:'2px 7px' }}>Converted to task</span>
                                      )}
                                      <button
                                        onClick={() => handleDeleteOpenItem(item.id)}
                                        style={{ padding:'3px 10px', border:'none', borderRadius:6, fontSize:11, fontWeight:600, background:'transparent', color: FS.xmuted, cursor:'pointer', fontFamily:'inherit' }}
                                      >
                                        Delete
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {convertingOpenItem?.id === item.id && (
                              <div style={{ marginTop:10, padding:12, background:'#fff', border:`1px solid ${FS.borderL}`, borderRadius:8 }}>
                                <div style={{ fontSize:12, fontWeight:600, color: FS.text, marginBottom:8 }}>Convert to task</div>
                                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                                  <select
                                    value={convertAssignee}
                                    onChange={e => setConvertAssignee(e.target.value)}
                                    style={{ flex:1, minWidth:120, padding:'6px 8px', border:`1px solid ${FS.border}`, borderRadius:6, fontSize:12, fontFamily:'inherit', background:'#fff' }}
                                  >
                                    <option value="">Unassigned</option>
                                    {orgUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                  </select>
                                  <input
                                    type="date"
                                    value={convertDueDate}
                                    onChange={e => setConvertDueDate(e.target.value)}
                                    style={{ padding:'6px 8px', border:`1px solid ${FS.border}`, borderRadius:6, fontSize:12, fontFamily:'inherit', background:'#fff' }}
                                  />
                                </div>
                                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                                  <button onClick={handleConvertOpenItem} style={{ padding:'6px 14px', border:'none', borderRadius:6, background: FS.purple, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Create Task</button>
                                  <button onClick={() => setConvertingOpenItem(null)} style={{ padding:'6px 14px', border:`1px solid ${FS.border}`, borderRadius:6, background:'#fff', color: FS.navy, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                ) : (
                  <div style={{ marginTop: 24, background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'24px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>🔒</div>
                    <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>Open items hidden by creator</div>
                    <div style={{ fontSize:12, color: FS.muted, marginTop:4 }}>The organizer hasn't shared open items from this meeting with you yet.</div>
                  </div>
                )}
              </div>
            )}

            {/* AUDIO TAB */}
            {activeTab === 'audio' && (
              <div style={{ flex:1, overflowY:'auto', padding: isMobile ? 12 : 18, display:'flex', flexDirection:'column', gap: isMobile ? 12 : 16, animation:'fadein .18s ease' }}>

                {/* Live Recording */}
                {canRecord && (
                  <AudioTranscriptionPanel
                    key={`record-${meetingId}`}
                    meetingId={meetingId}
                    departmentId={meeting.department_id}
                    canRecord={canRecord}
                    canManage={canManage}
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
                  canManage={canManage}
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
                  canManage={canManage}
                  meetingContext={context}
                  pasteOnly
                  onTranscriptionComplete={({ transcript }) => setMeeting(m => ({ ...m, summary: transcript }))}
                  onActionItemsExtracted={() => { fetchActionItems(); setActiveTab('actions') }}
                />

                {/* AI notes privacy toggle */}
                {minutesRecord && (
                  <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>AI Notes visibility</div>
                      <div style={{ fontSize:11, color: FS.muted, marginTop:2 }}>
                        {minutesRecord.is_private ? 'Private — only you and admins can see these notes' : 'Shared with all department members'}
                      </div>
                    </div>
                    <button
                      disabled={togglingPrivacy}
                      onClick={async () => {
                        setTogglingPrivacy(true)
                        const { error } = await supabase.rpc('toggle_minutes_privacy', {
                          p_minutes_id: minutesRecord.id,
                          p_is_private: !minutesRecord.is_private,
                        })
                        setTogglingPrivacy(false)
                        if (error) { showToast(`Couldn't update visibility: ${error.message}`, { tone: 'error' }); return }
                        setMinutesRecord(r => ({ ...r, is_private: !r.is_private }))
                      }}
                      style={{ flexShrink:0, padding:'7px 14px', border:`1px solid ${FS.border}`, borderRadius:6, background: minutesRecord.is_private ? FS.surface : FS.sageL, color: minutesRecord.is_private ? FS.navy : FS.sage, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor: togglingPrivacy ? 'wait' : 'pointer', opacity: togglingPrivacy ? 0.6 : 1 }}
                    >
                      {togglingPrivacy ? '…' : minutesRecord.is_private ? 'Share with department' : 'Make private'}
                    </button>
                  </div>
                )}

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
                      agenda={agenda}
                      openItems={openItems}
                      decisionsText={decisionsText}
                      minutesText={minutesText}
                      nextStepsText={nextStepsText}
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
                        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>Action items extracted — edit &amp; select to add to board</div>
                        {editableAiItems.map((item, i) => (
                          <div
                            key={i}
                            style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 10px', background: FS.surface, borderRadius:6, border:`1px solid ${selectedAiActionItems.has(i) ? FS.purple : FS.borderL}`, marginBottom:6 }}
                          >
                            <input type="checkbox" checked={selectedAiActionItems.has(i)} onChange={() => toggleAiActionItem(i)} style={{ marginTop:6, cursor:'pointer', accentColor: FS.purple }} />
                            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                              <input
                                value={item.title}
                                onChange={(e) => setEditableAiItems((prev) => prev.map((it, j) => j === i ? { ...it, title: e.target.value } : it))}
                                style={{ fontSize:13, fontWeight:600, color: FS.text, border:`1px solid ${FS.borderL}`, borderRadius:4, padding:'4px 6px', fontFamily:'inherit', width:'100%', background:'#fff' }}
                              />
                              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                                <select
                                  value={item.assigneeId}
                                  onChange={(e) => setEditableAiItems((prev) => prev.map((it, j) => j === i ? { ...it, assigneeId: e.target.value } : it))}
                                  style={{ fontSize:11, color: FS.text, border:`1px solid ${FS.borderL}`, borderRadius:4, padding:'3px 6px', fontFamily:'inherit', flex:1, minWidth:120, background:'#fff' }}
                                >
                                  <option value="">{item.owner && item.owner !== 'TBD' ? `${item.owner} (unmatched)` : 'Unassigned'}</option>
                                  {orgUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                                <select
                                  value={item.departmentId}
                                  onChange={(e) => setEditableAiItems((prev) => prev.map((it, j) => j === i ? { ...it, departmentId: e.target.value } : it))}
                                  style={{ fontSize:11, color: FS.text, border:`1px solid ${FS.borderL}`, borderRadius:4, padding:'3px 6px', fontFamily:'inherit', flex:1, minWidth:120, background:'#fff' }}
                                >
                                  <option value="">Meeting space</option>
                                  {orgDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                                <input
                                  type="date"
                                  value={item.due_date}
                                  onChange={(e) => setEditableAiItems((prev) => prev.map((it, j) => j === i ? { ...it, due_date: e.target.value } : it))}
                                  style={{ fontSize:11, color: FS.text, border:`1px solid ${FS.borderL}`, borderRadius:4, padding:'3px 6px', fontFamily:'inherit', background:'#fff' }}
                                />
                              </div>
                            </div>
                          </div>
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
                    {/* Open Items from AI extraction */}
                    {aiResult?.open_items?.length > 0 && (
                      <div style={{ background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: '#2D8653', marginBottom:8 }}>Open Discussion Items — select to track</div>
                        {aiResult.open_items.map((item, i) => {
                          const typeLabels = { question: '❓ Question', exploration: '🔍 Exploration', blocker: '🚫 Blocker', decision_point: '⚖️ Decision', future_consideration: '💡 Future' }
                          const score = item.confidence_score ?? 0
                          return (
                            <div
                              key={i}
                              style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 10px', background: FS.surface, borderRadius:6, border:`1px solid ${selectedAiOpenItems.has(i) ? '#2D8653' : FS.borderL}`, marginBottom:6 }}
                            >
                              <input type="checkbox" checked={selectedAiOpenItems.has(i)} onChange={() => toggleAiOpenItem(i)} style={{ marginTop:4, cursor:'pointer', accentColor:'#2D8653' }} />
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:600, color: FS.text }}>{item.item_text}</div>
                                <div style={{ display:'flex', gap:8, marginTop:3, fontSize:11, color: FS.muted, flexWrap:'wrap' }}>
                                  <span style={{ padding:'1px 6px', borderRadius:4, background:'#E8F5E9', color:'#2D8653', fontSize:10, fontWeight:600 }}>
                                    {typeLabels[item.item_type] || item.item_type}
                                  </span>
                                  <span>{Math.round(score * 100)}% confidence</span>
                                </div>
                                {item.transcript_excerpt && (
                                  <div style={{ fontSize:11, color: '#9A8F7E', marginTop:4, fontStyle:'italic' }}>
                                    "{item.transcript_excerpt.slice(0, 120)}{item.transcript_excerpt.length > 120 ? '…' : ''}"
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}

                        {aiOpenItemsMergeSuccess && (
                          <div style={{ marginTop:12, padding:'9px 14px', borderRadius:8, background: FS.sageL, color: FS.sage, fontSize:12, fontWeight:600, borderLeft:`3px solid ${FS.sage}` }}>
                            ✅ {selectedAiOpenItems.size} open item{selectedAiOpenItems.size !== 1 ? 's' : ''} saved for tracking.
                          </div>
                        )}

                        {!aiOpenItemsMergeSuccess && (
                          <div style={{ display:'flex', gap:8, marginTop:12 }}>
                            <button
                              onClick={handleAiOpenItemsMerge}
                              disabled={selectedAiOpenItems.size === 0 || mergingAiOpenItems}
                              style={{ padding:'7px 14px', border:'none', borderRadius:6, background:'#2D8653', color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:700, cursor: selectedAiOpenItems.size === 0 || mergingAiOpenItems ? 'not-allowed' : 'pointer', opacity: selectedAiOpenItems.size === 0 || mergingAiOpenItems ? 0.6 : 1 }}
                            >
                              {mergingAiOpenItems ? '⏳ Saving...' : `✓ Save ${selectedAiOpenItems.size} open item${selectedAiOpenItems.size !== 1 ? 's' : ''}`}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Export options after extraction: PDF + Save to Drive side by side */}
                    <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                      <div style={{ flex:'1 1 260px', background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'14px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                        <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>Export Minutes as PDF</div>
                        <div style={{ fontSize:11, color: FS.muted, marginTop:2, marginBottom:12 }}>Includes discussion, decisions, next steps & action items</div>
                        <button
                          onClick={exportPdf}
                          disabled={exportingPdf}
                          style={{ padding:'8px 16px', border:`1px solid ${FS.border}`, borderRadius:6, background: FS.surface, color: FS.navy, fontFamily:'inherit', fontSize:12, fontWeight:700, cursor: exportingPdf ? 'wait' : 'pointer', opacity: exportingPdf ? 0.7 : 1 }}
                        >
                          {exportingPdf ? '⏳ Exporting…' : '📤 Export PDF'}
                        </button>
                      </div>
                      <div style={{ flex:'1 1 260px', background: FS.surface, border:`1px solid ${FS.border}`, borderRadius:10, padding:'14px 18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
                        <div style={{ fontSize:13, fontWeight:700, color: FS.text }}>📄 Save to Drive</div>
                        <div style={{ fontSize:11, color: FS.muted, marginTop:2, marginBottom:12 }}>
                          Creates a formatted Google Doc with transcript, summary, and action items — uploaded to Drive automatically.
                        </div>
                        <GenerateMeetingDocButton
                          meetingId={meetingId}
                          meeting={meeting}
                          actionItems={actionItems}
                          agenda={agenda}
                          openItems={openItems}
                          decisionsText={decisionsText}
                          minutesText={minutesText}
                          nextStepsText={nextStepsText}
                          onSuccess={(result) => setMeeting(m => ({ ...m, doc_drive_url: result.docUrl, doc_title: result.docTitle }))}
                        />
                      </div>
                    </div>
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

      {shareModalOpen && (
        <MeetingShareModal
          meetingId={meetingId}
          attendees={(meeting.attendance ?? []).map((a) => ({ id: a.user_id, name: a.attendee?.name }))}
          allowedViewers={meeting.allowed_viewers ?? []}
          excludeUserIds={[meeting.created_by, profile?.id]}
          onClose={() => setShareModalOpen(false)}
          onChange={(next) => setMeeting((current) => ({ ...current, allowed_viewers: next }))}
        />
      )}
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
