import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { createTasksFromActionItems } from '../lib/meetings'
import { processSSELines } from '../../../lib/meetings/sseParser'
import { getAllDepartments, getAllUsers } from '../../automations/lib/automations'

// Accept any audio type — browser MIME strings vary (audio/x-m4a, audio/x-mpeg, etc.)
const isAudioType = (type) => type.startsWith('audio/') || type === 'video/webm'
const MAX_SIZE = 300 * 1024 * 1024
const STORAGE_LIMIT = 49 * 1024 * 1024 // 49MB — just under Supabase Storage 50MB limit

// Org directory (departments + users) rarely changes within a session and is
// needed by every panel instance (record/upload/paste render 3 copies on the
// same page) — memoize the fetch at module scope instead of per-instance.
let _orgDeptsPromise = null
let _orgUsersPromise = null
function getOrgDepartments() {
  if (!_orgDeptsPromise) _orgDeptsPromise = getAllDepartments()
  return _orgDeptsPromise
}
function getOrgUsers() {
  if (!_orgUsersPromise) _orgUsersPromise = getAllUsers()
  return _orgUsersPromise
}

const normalizeName = (s) => (s || '').trim().toLowerCase()

// Match an AI-extracted owner name to a real user. Only returns a match when
// it's unambiguous — a wrong auto-assignment is worse than none.
function matchUserByName(name, users) {
  const n = normalizeName(name)
  if (!n || n === 'tbd' || n === 'unassigned') return null
  const exact = users.find((u) => normalizeName(u.name) === n)
  if (exact) return exact
  const firstNameMatches = users.filter((u) => normalizeName(u.name).split(' ')[0] === n.split(' ')[0])
  return firstNameMatches.length === 1 ? firstNameMatches[0] : null
}

function matchDepartmentByName(name, departments) {
  const n = normalizeName(name)
  if (!n) return null
  return departments.find((d) => normalizeName(d.name) === n) ?? null
}


export default function AudioTranscriptionPanel({
  meetingId,
  departmentId,
  canRecord,
  meetingContext = '',    // WIN 2: context from meetings.context for better extraction
  startImmediately = false,
  stopImmediately = false,  // when true while recording → stop the recorder
  recordOnly = false,       // skip the mode selector, go straight to record UI
  pasteOnly = false,        // skip the mode selector, go straight to paste UI
  onRecordingChange,
  onTranscriptionComplete,
  onActionItemsExtracted,
}) {
  const { profile } = useAuth()
  const [mode, setMode] = useState(() => {
    if (pasteOnly) return 'paste'
    if (!canRecord) return 'upload'
    if (recordOnly) return 'record'
    return null
  })
  const [dragOver, setDragOver] = useState(false)
  const [audioFile, setAudioFile] = useState(null)
  const [audioPreview, setAudioPreview] = useState(null)
  const [isRecordingNow, setIsRecordingNow] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [pastedText, setPastedText] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [extracting, setExtracting] = useState(false)  // WIN 3: streaming extraction state
  const [progress, setProgress] = useState(0)
  const [chunkStatus, setChunkStatus] = useState('')
  const [error, setError] = useState('')
  const [transcript, setTranscript] = useState('')
  const [extractedData, setExtractedData] = useState(null)

  // confirm-before-merge state
  const [selectedActionItems, setSelectedActionItems] = useState(new Set())
  const [merging, setMerging] = useState(false)
  const [mergeSuccess, setMergeSuccess] = useState(false)
  // Per-action-item assignee/department, keyed by index into extractedData.action_items.
  // Pre-filled from AI-suggested owner/space (when unambiguous) but always user-editable.
  const [actionAssignments, setActionAssignments] = useState([])
  const [orgDirectory, setOrgDirectory] = useState({ departments: [], users: [] })

  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const recordingInterval = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (isRecordingNow) {
      recordingInterval.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    } else {
      clearInterval(recordingInterval.current)
    }
    return () => clearInterval(recordingInterval.current)
  }, [isRecordingNow])

  // Auto-start recording when header button triggers it
  useEffect(() => {
    if (startImmediately && canRecord && (mode === null || mode === 'record') && !isRecordingNow) {
      setMode('record')
      const t = setTimeout(() => handleStartRecording(), 150)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startImmediately])

  // Auto-stop recording when header Stop button is clicked
  useEffect(() => {
    if (stopImmediately && isRecordingNow) {
      handleStopRecording()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopImmediately])

  // Notify parent when recording state changes
  useEffect(() => {
    onRecordingChange?.(isRecordingNow)
  }, [isRecordingNow, onRecordingChange])

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Recording ────────────────────────────────────────────────────────────────

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current = new MediaRecorder(stream)
      audioChunks.current = []

      mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data)
      mediaRecorder.current.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
        setAudioPreview(URL.createObjectURL(blob))
        setAudioFile(blob)
        setIsRecordingNow(false)
        stream.getTracks().forEach((t) => t.stop())
      }

      mediaRecorder.current.start()
      setIsRecordingNow(true)
      setRecordingTime(0)
      setError('')
    } catch {
      setError('Microphone access denied. Check browser permissions.')
    }
  }

  const handleStopRecording = () => {
    if (mediaRecorder.current && isRecordingNow) {
      mediaRecorder.current.stop()
    }
  }

  // ── File upload ───────────────────────────────────────────────────────────────

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) acceptFile(file)
  }

  const acceptFile = (file) => {
    setError('')
    if (!isAudioType(file.type)) {
      setError(`Unsupported file type (${file.type || 'unknown'}). Use MP3, WAV, M4A, or WebM.`)
      return
    }
    if (file.size > MAX_SIZE) {
      setError('File too large. Maximum 300 MB.')
      return
    }
    setAudioFile(file)
    setAudioPreview(URL.createObjectURL(file))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) { setMode('upload'); acceptFile(file) }
  }

  // ── Streaming extraction (WIN 3) ──────────────────────────────────────────────

  /** Race any promise against a timeout; rejects with a clear message on expiry. */
  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s — the server may be overloaded. Please try again.`)), ms)
      ),
    ])

  /**
   * Apply a parsed extraction result to React state, resolving each action
   * item's AI-suggested owner/space against the real org directory.
   * Returns true when a valid result was committed, false otherwise.
   */
  const applyExtractedResult = (fullText, wasTruncated, directory) => {
    const commit = (result) => {
      setExtractedData({ ...result, truncated: wasTruncated })
      if (result.action_items?.length) {
        setSelectedActionItems(new Set(result.action_items.map((_, i) => i)))
        setActionAssignments(
          result.action_items.map((item) => ({
            assigneeId: matchUserByName(item.owner, directory.users)?.id ?? null,
            departmentId: matchDepartmentByName(item.suggested_space, directory.departments)?.id ?? null,
          })),
        )
      } else {
        setActionAssignments([])
      }
    }

    // Try plain JSON first
    try {
      commit(JSON.parse(fullText))
      return true
    } catch { /* fall through */ }

    // Claude sometimes wraps output in markdown fences — strip and retry
    const match = fullText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) {
      try {
        commit(JSON.parse(match[1]))
        return true
      } catch { /* ignore */ }
    }
    return false
  }

  const streamExtractMeetingData = async (transcriptText) => {
    setExtracting(true)
    setExtractedData(null)
    setActionAssignments([])

    // Org directory drives both the AI's space-suggestion context (linked_spaces/
    // participants) and the client-side owner/space matching once results land.
    const [departments, users] = await Promise.all([getOrgDepartments(), getOrgUsers()])
    const directory = { departments, users }
    setOrgDirectory(directory)
    const deptNameById = Object.fromEntries(departments.map((d) => [d.id, d.name]))
    const linkedSpaces = departments.map((d) => d.name)
    const participants = users.map((u) => {
      const space = deptNameById[u.department_id] ?? null
      return { name: u.name, spaces: space ? [space] : [], primary: space }
    })

    try {
      const session = (await supabase.auth.getSession()).data.session
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const response = await fetch(`${supabaseUrl}/functions/v1/extract-meeting-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          transcript: transcriptText,
          context: meetingContext || '',
          linked_spaces: linkedSpaces,
          participants,
          stream: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`Extraction failed: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let buffer = ''
      let receivedDone = false

      const streamingLoop = async () => {
        while (true) {
          const { value, done: streamDone } = await reader.read()
          if (streamDone) break

          // stream:true tells TextDecoder to buffer incomplete multi-byte chars
          const rawChunk = decoder.decode(value, { stream: true })
          const { updatedBuffer, events, error } = processSSELines(buffer, rawChunk)

          // Buffer overflow: stream is likely corrupted, fall back to non-streaming
          if (error === 'buffer_overflow') {
            throw new Error('SSE buffer overflow — stream appears corrupted. Switching to non-streaming extraction.')
          }

          buffer = updatedBuffer

          for (const event of events) {
            if (event.done) {
              receivedDone = true
              applyExtractedResult(fullText, !!event.truncated, directory)
            } else if (event.text) {
              fullText += event.text
            }
          }

          if (receivedDone) break
        }

        // Flush any remaining partial line after the stream closes cleanly
        const remaining = buffer.trim()
        if (!receivedDone && remaining.startsWith('data: ')) {
          try {
            const event = JSON.parse(remaining.slice(6))
            if (event.done) {
              receivedDone = true
              applyExtractedResult(fullText, !!event.truncated, directory)
            } else if (event.text) {
              fullText += event.text
            }
          } catch (err) {
            console.error('[streamExtract] Final buffer parse error:', err.message, { remaining })
          }
        }

        if (!receivedDone) {
          console.warn('[streamExtract] Stream closed without a done event — extraction may have failed')
        }
      }

      await withTimeout(streamingLoop(), 120_000, 'streamExtractMeetingData')
    } catch (err) {
      const isTimeout = err.message?.includes('timed out')
      console.warn(
        isTimeout ? '[streamExtract] Timed out — falling back to non-streaming' : 'Streaming extraction failed, falling back to non-streaming:',
        err
      )
      if (isTimeout) {
        setError(err.message)
      }
      // Fallback: non-streaming invoke
      try {
        const { data: extractData, error: extractErr } = await supabase.functions.invoke(
          'extract-meeting-data',
          { body: { transcript: transcriptText, context: meetingContext || '', linked_spaces: linkedSpaces, participants } }
        )
        if (!extractErr && extractData?.extracted) {
          setExtractedData({
            ...extractData.extracted,
            output_mode: extractData.output_mode,
            transcript: extractData.transcript || transcriptText,
            truncated: !!extractData.truncated,
          })
          if (extractData.extracted.action_items?.length) {
            setSelectedActionItems(new Set(extractData.extracted.action_items.map((_, i) => i)))
            setActionAssignments(
              extractData.extracted.action_items.map((item) => ({
                assigneeId: matchUserByName(item.owner, directory.users)?.id ?? null,
                departmentId: matchDepartmentByName(item.suggested_space, directory.departments)?.id ?? null,
              })),
            )
          }
          // Clear any timeout error if the fallback succeeded
          if (isTimeout) setError('')
        } else if (extractErr) {
          setError('AI extraction failed. Please try again or extract manually.')
        }
      } catch (fallbackErr) {
        console.warn('[streamExtract] Fallback also failed:', fallbackErr)
        setError('AI extraction is unavailable right now. Your transcript was saved successfully.')
      }
    } finally {
      setExtracting(false)
    }
  }

  // ── Transcription ─────────────────────────────────────────────────────────────

  const handleTranscribe = async () => {
    if (!audioFile) { setError('No audio selected.'); return }
    setTranscribing(true)
    setProgress(0)
    setChunkStatus('')
    setError('')
    setTranscript('')
    setExtractedData(null)
    setMergeSuccess(false)

    try {
      const originalName = audioFile instanceof File ? audioFile.name : 'recording'
      const isLarge = audioFile.size > STORAGE_LIMIT

      let transcript = ''

      if (isLarge) {
        // Large file: stream binary directly to edge function — no storage, no browser decode
        setChunkStatus('Uploading & transcribing…')
        setProgress(20)
        const session = (await supabase.auth.getSession()).data.session
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const resp = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio-direct`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-audio-content-type': audioFile.type || 'audio/octet-stream',
            'x-meeting-id': meetingId,
            'x-user-id': profile?.id || '',
          },
          body: audioFile,
        })
        setProgress(80)
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          throw new Error(err.error || `Server error ${resp.status}`)
        }
        const data = await resp.json()
        transcript = data.transcript?.trim() ?? ''
        if (!transcript) throw new Error('No speech detected in audio.')
      } else {
        // Small file: existing storage → Deepgram flow
        setChunkStatus('Uploading…')
        setProgress(20)
        const ext = audioFile instanceof File ? (audioFile.name.split('.').pop() || 'webm') : 'webm'
        const fileName = `private/${meetingId}-${Date.now()}.${ext}`
        const { data: upload, error: uploadErr } = await supabase.storage
          .from('meeting-audio')
          .upload(fileName, audioFile, { cacheControl: '3600', upsert: false })
        if (uploadErr) throw uploadErr

        setChunkStatus('Transcribing…')
        setProgress(50)
        const { data: deepgramData, error: dgErr } = await supabase.functions.invoke(
          'transcribe-audio-deepgram',
          { body: { audioPath: upload.path } }
        )
        if (dgErr) throw dgErr
        transcript = (deepgramData?.transcript || deepgramData?.data?.transcript || '').trim()
        if (!transcript) throw new Error('No speech detected in audio.')
        setProgress(80)
      }

      setTranscript(transcript)
      setChunkStatus('Saving transcript…')
      setProgress(85)

      const { data: record, error: recErr } = await supabase
        .from('meeting_transcriptions')
        .insert([{
          meeting_id: meetingId,
          input_type: 'audio',
          input_file_name: originalName,
          summary: transcript.slice(0, 500),
          status: 'complete',
          tokens_used: 0,
          created_by: profile?.id,
          processed_at: new Date().toISOString(),
        }])
        .select()
        .single()
      if (recErr) console.warn('Transcription record save failed:', recErr)
      await supabase.from('meetings').update({ summary: transcript }).eq('id', meetingId)

      setProgress(100)
      setChunkStatus('')
      onTranscriptionComplete?.({ transcript, record, extracted: null })

      // WIN 3: stream extraction asynchronously after transcription is saved
      streamExtractMeetingData(transcript)
    } catch (err) {
      setError(err.message || 'Transcription failed.')
    } finally {
      setTranscribing(false)
    }
  }

  const saveTranscriptText = async (transcriptText) => {
    const { data: record, error: recErr } = await supabase
      .from('meeting_transcriptions')
      .insert([{
        meeting_id: meetingId,
        input_type: 'text',
        input_file_name: 'pasted-transcript',
        summary: transcriptText.slice(0, 500),
        status: 'complete',
        tokens_used: 0,
        created_by: profile?.id,
        processed_at: new Date().toISOString(),
      }])
      .select()
      .single()
    if (recErr) console.warn('Transcription record save failed:', recErr)
    await supabase.from('meetings').update({ summary: transcriptText }).eq('id', meetingId)
    return record
  }

  const handleSaveTranscript = async () => {
    if (!pastedText.trim()) { setError('Please enter a transcript.'); return }
    setTranscribing(true)
    setProgress(0)
    setError('')
    setTranscript('')
    setExtractedData(null)
    setMergeSuccess(false)
    try {
      const transcriptText = pastedText.trim()
      setProgress(50)
      const record = await saveTranscriptText(transcriptText)
      setProgress(100)
      setTranscript(transcriptText)
      onTranscriptionComplete?.({ transcript: transcriptText, record, extracted: null })
    } catch (err) {
      setError(err.message || 'Save failed.')
    } finally {
      setTranscribing(false)
    }
  }

  const handleExtractFromPaste = async () => {
    if (!pastedText.trim()) { setError('Please paste a transcript.'); return }
    setTranscribing(true)
    setProgress(0)
    setError('')
    setTranscript('')
    setExtractedData(null)
    setMergeSuccess(false)

    try {
      const transcriptText = pastedText.trim()
      setProgress(30)
      setTranscript(transcriptText)

      // Save first so AI Extract always has the text
      setProgress(60)
      const record = await saveTranscriptText(transcriptText)

      setProgress(100)
      onTranscriptionComplete?.({ transcript: transcriptText, record, extracted: null })

      // WIN 3: stream extraction asynchronously
      streamExtractMeetingData(transcriptText)
    } catch (err) {
      setError(err.message || 'Extraction failed.')
    } finally {
      setTranscribing(false)
    }
  }

  // ── Merge action items → tasks ────────────────────────────────────────────────

  const handleMerge = async () => {
    if (!extractedData?.action_items?.length || !departmentId) return
    setMerging(true)
    setError('')
    try {
      const items = extractedData.action_items
        .map((item, i) => ({ item, i }))
        .filter(({ i }) => selectedActionItems.has(i))
        .map(({ item, i }) => {
          const assignment = actionAssignments[i] ?? {}
          return {
            title: item.title,
            assigneeId: assignment.assigneeId ?? null,
            departmentId: assignment.departmentId ?? null,
            dueDate: item.due_date ?? null,
            description: item.owner && item.owner !== 'TBD' && !assignment.assigneeId ? `Owner: ${item.owner}` : null,
          }
        })
      if (!items.length) { setMerging(false); return }
      await createTasksFromActionItems(meetingId, departmentId, items, profile?.id)
      setMergeSuccess(true)
      onActionItemsExtracted?.(items)
    } catch (err) {
      setError(err.message || 'Failed to create tasks.')
    } finally {
      setMerging(false)
    }
  }

  const toggleItem = (i) => {
    setSelectedActionItems((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const handleAssignmentChange = (i, field, value) => {
    setActionAssignments((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: value || null }
      return next
    })
  }

  const reset = () => {
    setMode(recordOnly ? 'record' : canRecord ? null : 'upload')
    setAudioFile(null)
    setAudioPreview(null)
    setPastedText('')
    setTranscript('')
    setExtractedData(null)
    setRecordingTime(0)
    setProgress(0)
    setChunkStatus('')
    setError('')
    setMergeSuccess(false)
    setSelectedActionItems(new Set())
    setActionAssignments([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Styles ────────────────────────────────────────────────────────────────────

  const s = {
    container: { display: 'flex', flexDirection: 'column', gap: 20 },
    card: { background: '#FAFAF8', borderRadius: 8, padding: 20, border: '1px solid #EDE8DC' },
    title: { fontSize: 15, fontWeight: 700, color: '#2D2A22', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 },
    sub: { fontSize: 13, color: '#7A6F5E', marginBottom: 16 },
    modeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
    modeBtn: {
      padding: '20px 16px', borderRadius: 8, border: '2px solid #E9E4D8',
      background: '#fff', cursor: 'pointer', textAlign: 'center', fontSize: 13,
      fontWeight: 600, color: '#2D2A22', transition: 'all .2s',
    },
    recIndicator: {
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      background: '#FF5A3C', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, marginBottom: 16,
    },
    dot: { width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'pulse 1s infinite' },
    timer: { fontSize: 28, fontWeight: 700, textAlign: 'center', color: '#4C2A92', margin: '16px 0', fontFamily: 'DM Mono, monospace' },
    btnGroup: { display: 'flex', gap: 10, marginTop: 12 },
    btn: { flex: 1, padding: '10px 16px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .2s' },
    btnPrimary: { background: '#4C2A92', color: '#fff' },
    btnSecondary: { background: '#EDE8DC', color: '#2D2A22' },
    btnDanger: { background: '#DC2626', color: '#fff' },
    fileLabel: {
      display: 'block', padding: '28px 16px', borderRadius: 8, border: '2px dashed #E9E4D8',
      background: '#fff', cursor: 'pointer', textAlign: 'center', fontSize: 13, color: '#7A6F5E', transition: 'all .2s',
    },
    fileInfo: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', background: '#fff', borderRadius: 6, fontSize: 13,
      borderLeft: '3px solid #4C2A92', marginTop: 10,
    },
    progressWrap: { height: 6, background: '#E9E4D8', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
    progressFill: { height: '100%', background: '#4C2A92', transition: 'width .3s' },
    error: { padding: '10px 14px', background: '#FEE8E6', borderRadius: 6, color: '#C73B2B', fontSize: 13, borderLeft: '3px solid #C73B2B', marginTop: 12 },
    success: { padding: '10px 14px', background: '#E8F5E9', borderRadius: 6, color: '#2E7D32', fontSize: 13, borderLeft: '3px solid #2E7D32', marginTop: 12 },
    warning: { padding: '10px 14px', background: '#FEF0E6', borderRadius: 6, color: '#9E5C3C', fontSize: 13, borderLeft: '3px solid #E8A020', marginTop: 12 },
    transcriptBox: { padding: 14, background: '#fff', borderRadius: 6, border: '1px solid #E9E4D8', fontSize: 13, lineHeight: 1.7, maxHeight: 200, overflowY: 'auto', color: '#2D2A22' },
    extractSection: { marginTop: 16, padding: 16, background: '#F5F2ED', borderRadius: 6, border: '1px solid #E9E4D8' },
    extractLabel: { fontSize: 11, fontWeight: 700, color: '#4C2A92', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 },
    checkRow: {
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
      background: '#fff', borderRadius: 6, border: '1px solid #E9E4D8', cursor: 'pointer',
      fontSize: 13, color: '#2D2A22', marginBottom: 6,
    },
    backBtn: { padding: '6px 10px', border: 'none', background: 'transparent', color: '#4C2A92', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 8 },
  }

  // ── Mode selection ────────────────────────────────────────────────────────────

  if (mode === null) {
    const gridCols = canRecord ? '1fr 1fr 1fr' : '1fr 1fr'
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h3 style={s.title}>Transcribe Meeting Audio</h3>
          <p style={s.sub}>Upload a recording, record live, or paste an existing transcript</p>
          <div style={{ ...s.modeGrid, gridTemplateColumns: gridCols }}>
            <button
              style={s.modeBtn}
              onClick={() => setMode('upload')}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#F5F2ED' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.background = '#fff' }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
              <div>Upload file</div>
              <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 4 }}>MP3, WAV, M4A • max 300 MB</div>
            </button>
            {canRecord && (
              <button
                style={s.modeBtn}
                onClick={() => setMode('record')}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#F5F2ED' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.background = '#fff' }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎙️</div>
                <div>Record live</div>
                <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 4 }}>Capture audio now</div>
              </button>
            )}
            <button
              style={s.modeBtn}
              onClick={() => setMode('paste')}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#F5F2ED' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.background = '#fff' }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <div>Paste transcript</div>
              <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 4 }}>Zoom, Teams, etc.</div>
            </button>
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
      </div>
    )
  }

  // ── Record mode ───────────────────────────────────────────────────────────────

  if (mode === 'record') {
    return (
      <div style={s.container}>
        {!recordOnly && <button style={s.backBtn} onClick={reset}>← Back</button>}
        <div style={s.card}>
          <h3 style={s.title}>Record live audio</h3>
          {isRecordingNow && (
            <div style={s.recIndicator}>
              <div style={s.dot} /> Recording in progress
            </div>
          )}
          {!isRecordingNow && !audioPreview && (
            <p style={s.sub}>Click start to record from your microphone.</p>
          )}
          {!isRecordingNow && audioPreview && (
            <p style={s.sub}>Preview your recording before transcribing.</p>
          )}
          <div style={s.timer}>{formatTime(recordingTime)}</div>
          {audioPreview && <audio src={audioPreview} controls style={{ width: '100%', marginBottom: 12 }} />}
          {error && <div style={s.error}>{error}</div>}
          <div style={s.btnGroup}>
            {isRecordingNow ? (
              <button style={{ ...s.btn, ...s.btnDanger }} onClick={handleStopRecording}>⏹ Stop recording</button>
            ) : audioPreview ? (
              <>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleTranscribe} disabled={transcribing}>
                  {transcribing ? '🔄 Transcribing...' : '✨ Transcribe'}
                </button>
                <button style={{ ...s.btn, ...s.btnSecondary }} onClick={reset}>Clear</button>
              </>
            ) : (
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleStartRecording}>🎙️ Start recording</button>
            )}
          </div>
          {transcribing && (
            <>
              <div style={{ ...s.progressWrap, marginTop: 14 }}>
                <div style={{ ...s.progressFill, width: `${progress}%` }} />
              </div>
              <p style={{ ...s.sub, marginTop: 4 }}>{progress}% — {chunkStatus || (progress < 40 ? 'Uploading...' : progress < 70 ? 'Transcribing...' : 'Extracting data...')}</p>
            </>
          )}
        </div>
        {transcript && <TranscriptCard transcript={transcript} extractedData={extractedData} extracting={extracting} selectedItems={selectedActionItems} toggleItem={toggleItem} onMerge={handleMerge} merging={merging} mergeSuccess={mergeSuccess} error={error} s={s} orgDirectory={orgDirectory} assignments={actionAssignments} onAssignmentChange={handleAssignmentChange} />}
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} } @keyframes spin { to{transform:rotate(360deg)} }`}</style>
      </div>
    )
  }

  // ── Upload mode ───────────────────────────────────────────────────────────────

  if (mode === 'upload') {
    return (
      <div style={s.container}>
        {canRecord && <button style={s.backBtn} onClick={reset}>← Back</button>}
        <div style={s.card}>
          <h3 style={s.title}>Upload audio file</h3>
          <p style={s.sub}>MP3, WAV, M4A, WebM — max 300 MB</p>
          <input type="file" ref={fileInputRef} accept="audio/*" onChange={handleFileSelect} disabled={transcribing} style={{ display: 'none' }} id="audio-file-input" />
          <label
            htmlFor="audio-file-input"
            style={{
              ...s.fileLabel,
              ...(dragOver ? { borderColor: '#4C2A92', background: '#F0EBF8', color: '#4C2A92' } : {}),
              ...(audioFile ? { borderColor: '#4C2A92', background: '#F5F2FD' } : {}),
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onMouseEnter={(e) => { if (!dragOver) { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#F5F2ED' } }}
            onMouseLeave={(e) => { if (!dragOver && !audioFile) { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#7A6F5E' } }}
          >
            {audioFile
              ? `✅ ${audioFile instanceof File ? audioFile.name : 'recording.webm'}`
              : dragOver ? '📂 Drop to upload' : '🎵 Click to choose or drag & drop audio file'}
          </label>
          {audioFile && (
            <div style={s.fileInfo}>
              <span>{audioFile instanceof File ? audioFile.name : 'recording.webm'}</span>
              <span style={{ color: '#7A6F5E' }}>{((audioFile.size ?? 0) / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          )}
          {audioPreview && <audio src={audioPreview} controls style={{ width: '100%', marginTop: 12 }} />}
          {transcribing && (
            <>
              <div style={{ ...s.progressWrap, marginTop: 14 }}>
                <div style={{ ...s.progressFill, width: `${progress}%` }} />
              </div>
              <p style={{ ...s.sub, marginTop: 4 }}>{progress}% — {chunkStatus || (progress < 40 ? 'Uploading...' : progress < 70 ? 'Transcribing...' : 'Extracting data...')}</p>
            </>
          )}
          {audioFile && !transcribing && !transcript && (
            <div style={s.btnGroup}>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleTranscribe}>✨ Transcribe</button>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={reset}>Clear</button>
            </div>
          )}
        </div>
        {transcript && <TranscriptCard transcript={transcript} extractedData={extractedData} extracting={extracting} selectedItems={selectedActionItems} toggleItem={toggleItem} onMerge={handleMerge} merging={merging} mergeSuccess={mergeSuccess} error={error} s={s} orgDirectory={orgDirectory} assignments={actionAssignments} onAssignmentChange={handleAssignmentChange} />}
      </div>
    )
  }

  // ── Paste transcript mode ─────────────────────────────────────────────────────

  if (mode === 'paste') {
    return (
      <div style={s.container}>
        {!pasteOnly && <button style={s.backBtn} onClick={reset}>← Back</button>}
        <div style={s.card}>
          <h3 style={s.title}>Paste transcript</h3>
          <p style={s.sub}>Copy & paste from Zoom, Teams, Google Meet, or other sources</p>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            disabled={transcribing}
            placeholder="Paste your transcript text here..."
            style={{
              width: '100%',
              minHeight: 200,
              padding: 14,
              fontSize: 13,
              lineHeight: 1.6,
              border: '1px solid #E9E4D8',
              borderRadius: 6,
              fontFamily: 'monospace',
              color: '#2D2A22',
              backgroundColor: '#fff',
              marginBottom: 12,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          {error && <div style={s.error}>{error}</div>}
          {transcribing && (
            <>
              <div style={{ ...s.progressWrap, marginTop: 14 }}>
                <div style={{ ...s.progressFill, width: `${progress}%` }} />
              </div>
              <p style={{ ...s.sub, marginTop: 4 }}>{progress}% — {progress < 50 ? 'Processing...' : 'Extracting data...'}</p>
            </>
          )}
          {pastedText && !transcribing && !transcript && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={s.btnGroup}>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleSaveTranscript}>
                  💾 Save transcript
                </button>
                <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handleExtractFromPaste}>
                  ✨ Save + extract insights
                </button>
              </div>
              <button style={{ ...s.btn, ...s.btnSecondary, flex: 'none', width: 'fit-content' }} onClick={reset}>Clear</button>
            </div>
          )}
        </div>
        {transcript && <TranscriptCard transcript={transcript} extractedData={extractedData} extracting={extracting} selectedItems={selectedActionItems} toggleItem={toggleItem} onMerge={handleMerge} merging={merging} mergeSuccess={mergeSuccess} error={error} s={s} orgDirectory={orgDirectory} assignments={actionAssignments} onAssignmentChange={handleAssignmentChange} />}
      </div>
    )
  }

  return null
}

// ── Transcript + extracted data card ─────────────────────────────────────────────
function TranscriptCard({ transcript, extractedData, extracting, selectedItems, toggleItem, onMerge, merging, mergeSuccess, error, s, orgDirectory, assignments, onAssignmentChange }) {
  return (
    <div style={s.card}>
      <h3 style={s.title}>Transcript</h3>
      <div style={s.transcriptBox}>{transcript}</div>

      {extractedData?.truncated === true && (
        <div style={s.warning}>
          ⚠️ This meeting was long — only the first portion of the transcript was sent for extraction.
          Some decisions or action items from later in the meeting may be missing below. The full transcript is shown above.
        </div>
      )}

      {/* WIN 3: spinner while streaming extraction runs */}
      {extracting && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#F0EBF8', borderRadius:6, marginTop:12 }}>
          <div style={{ width:20, height:20, border:'3px solid #E0E0E0', borderTopColor:'#4C2A92', borderRadius:'50%', animation:'spin 0.8s linear infinite', flexShrink:0 }} />
          <p style={{ margin:0, fontSize:13, color:'#4C2A92', fontWeight:600 }}>Extracting action items…</p>
        </div>
      )}

      {!extracting && extractedData && (
        <div style={s.extractSection}>
          {extractedData.summary && (
            <>
              <div style={s.extractLabel}>Summary</div>
              <p style={{ fontSize: 13, color: '#2D2A22', margin: '0 0 16px' }}>{extractedData.summary}</p>
            </>
          )}

          {extractedData.decisions?.length > 0 && (
            <>
              <div style={s.extractLabel}>Decisions made</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
                {extractedData.decisions.map((d, idx) => (
                  <li key={`decision-${idx}`} style={{ padding: '6px 0', fontSize: 13, color: '#2D2A22', borderBottom: '1px solid #EDE8DC' }}>
                    ✓ {typeof d === 'string' ? d : d.decision}
                    {typeof d !== 'string' && d.context && (
                      <small style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>— {d.context}</small>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {extractedData.action_items?.length > 0 && (
            <>
              <div style={s.extractLabel}>Action items — select to add to board</div>
              {extractedData.action_items.map((item, i) => {
                const assignment = assignments?.[i] ?? {}
                const users = orgDirectory?.users ?? []
                const departments = orgDirectory?.departments ?? []
                return (
                  <label key={`action-item-${i}`} style={{ ...s.checkRow, flexDirection: 'column', alignItems: 'stretch' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', borderLeft: `2px solid ${selectedItems.has(i) ? '#4C2A92' : 'transparent'}`, paddingLeft: 4 }}
                      onClick={() => toggleItem(i)}
                    >
                      <input type="checkbox" checked={selectedItems.has(i)} onChange={() => toggleItem(i)} style={{ marginTop: 2, cursor: 'pointer', accentColor: '#4C2A92' }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 2 }}>
                          AI suggested owner: {item.owner || 'TBD'}{item.due_date ? ` · Due ${item.due_date}` : ''}
                          {item.suggested_space ? ` · Space: ${item.suggested_space}` : ''}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{ display: 'flex', gap: 8, marginTop: 8, marginLeft: 26 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        aria-label="Assignee"
                        value={assignment.assigneeId ?? ''}
                        onChange={(e) => onAssignmentChange(i, 'assigneeId', e.target.value)}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #E9E4D8', borderRadius: 6, background: '#fff', color: '#2D2A22' }}
                      >
                        <option value="">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Space"
                        value={assignment.departmentId ?? ''}
                        onChange={(e) => onAssignmentChange(i, 'departmentId', e.target.value)}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #E9E4D8', borderRadius: 6, background: '#fff', color: '#2D2A22' }}
                      >
                        <option value="">This meeting's space</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </label>
                )
              })}

              {mergeSuccess ? (
                <div style={s.success}>✅ {selectedItems.size} task{selectedItems.size !== 1 ? 's' : ''} added to the Actions board.</div>
              ) : (
                <div style={{ ...s.btnGroup, marginTop: 12 }}>
                  <button
                    style={{ ...s.btn, ...s.btnPrimary, opacity: selectedItems.size === 0 || merging ? 0.6 : 1 }}
                    onClick={onMerge}
                    disabled={selectedItems.size === 0 || merging}
                  >
                    {merging ? '⏳ Adding...' : `✓ Add ${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''} to board`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}
    </div>
  )
}
