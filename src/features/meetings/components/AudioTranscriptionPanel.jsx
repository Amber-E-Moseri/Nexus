import { useState, useRef, useEffect } from 'react'
import { FileText, FolderOpen, LoaderCircle, Mic, Plus, Sparkles, Square } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { createTasksFromActionItems } from '../lib/meetings'
import { createOpenItems } from '../lib/openItems'
import { resolveAssignment, getOrgDepartments, getOrgUsers } from '../lib/ownerMatching'
import { processSSELines } from '../../../lib/meetings/sseParser'
import { SprintPicker } from '../../sprints'
import { extractISODate } from '../../../lib/dateUtils'
import { autoSelectOpenItems } from '../lib/applyExtraction'

// Accept any audio type — browser MIME strings vary (audio/x-m4a, audio/x-mpeg, etc.)
const isAudioType = (type) => type.startsWith('audio/') || type === 'video/webm'
const MAX_SIZE = 300 * 1024 * 1024
function displayAudioUploadName(fileName, index) {
  if (!fileName) return `Audio upload ${index + 1}`
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}-\d+\.[a-z0-9]+$/i.test(fileName)) {
    return `Audio upload ${index + 1}`
  }
  return fileName
}
// Files above this threshold stream directly to the Whisper edge function instead of
// going through Deepgram. Whisper handles noisy/fragmented/multi-speaker meeting audio
// much better. Only very small clips (quick tests, short voice memos) stay on Deepgram.
const STORAGE_LIMIT = 5 * 1024 * 1024 // 5MB — ~2-3 min of audio

export default function AudioTranscriptionPanel({
  meetingId,
  departmentId,
  canRecord,
  canManage = true,
  meetingContext = '',    // WIN 2: context from meetings.context for better extraction
  startImmediately = false,
  stopImmediately = false,  // when true while recording → stop the recorder
  recordOnly = false,       // skip the mode selector, go straight to record UI
  pasteOnly = false,        // skip the mode selector, go straight to paste UI
  onRecordingChange,
  onTranscriptionComplete,
  onActionItemsExtracted,
  onExpand,
  onCollapse,
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
  const [audioQueue, setAudioQueue] = useState([]) // queued files to transcribe in sequence
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
  const [extractError, setExtractError] = useState(null) // distinct from transcription errors

  // Multi-audio support
  const [transcriptions, setTranscriptions] = useState([]) // Array of {id, input_type, input_file_name, summary, sequence_number, created_at}
  const [showAddMore, setShowAddMore] = useState(false)
  const [showUploadHistory, setShowUploadHistory] = useState(false)

  // confirm-before-merge state
  const [selectedActionItems, setSelectedActionItems] = useState(new Set())
  const [merging, setMerging] = useState(false)
  const [mergeSuccess, setMergeSuccess] = useState(false)
  // Per-action-item assignee/department, keyed by index into extractedData.action_items.
  // Pre-filled from AI-suggested owner/space (when unambiguous) but always user-editable.
  const [actionAssignments, setActionAssignments] = useState([])
  const [orgDirectory, setOrgDirectory] = useState({ departments: [], users: [] })

  // open items confirm-before-save state
  const [selectedOpenItems, setSelectedOpenItems] = useState(new Set())
  const [mergingOpenItems, setMergingOpenItems] = useState(false)
  const [openItemsMergeSuccess, setOpenItemsMergeSuccess] = useState(false)

  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const recordingInterval = useRef(null)
  const fileInputRef = useRef(null)
  const handleTranscribeRef = useRef(null)
  const isQueueContinuation = useRef(false)
  // Mirrors props into refs so the unmount-cleanup effect below (empty deps,
  // so it only fires once on true unmount) always sees the latest meetingId,
  // not whatever it was on first render.
  const meetingIdRef = useRef(meetingId)
  meetingIdRef.current = meetingId

  useEffect(() => {
    if (isRecordingNow) {
      recordingInterval.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    } else {
      clearInterval(recordingInterval.current)
    }
    return () => clearInterval(recordingInterval.current)
  }, [isRecordingNow])

  // Warn before a full tab close/reload while actively recording — the only
  // way to guarantee the mic gets released is to not lose the in-memory
  // audio chunks out from under an active MediaRecorder.
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (mediaRecorder.current?.state === 'recording') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Safety net for in-app navigation (closing this modal, routing away) —
  // there's no reliable "confirm before leaving" hook available with this
  // app's plain BrowserRouter (no data router = no useBlocker), so instead:
  // if this component unmounts while still recording, stop the recorder
  // (releases the mic — the actual leak) and upload whatever was captured
  // so far as a raw backup, rather than silently discarding it. The normal
  // onstop handler in handleStartRecording calls setState, which would warn/
  // no-op post-unmount, so it's swapped out for an upload-only handler here.
  useEffect(() => {
    return () => {
      if (mediaRecorder.current?.state === 'recording') {
        const chunksSoFar = audioChunks.current
        const meetingIdAtUnmount = meetingIdRef.current
        mediaRecorder.current.onstop = () => {
          mediaRecorder.current?.stream?.getTracks().forEach((t) => t.stop())
          const blob = new Blob(chunksSoFar, { type: 'audio/webm' })
          const fileName = `private/${meetingIdAtUnmount}-${Date.now()}-autosaved.webm`
          supabase.storage
            .from('meeting-audio')
            .upload(fileName, blob, { cacheControl: '3600', upsert: false })
            .then(({ error: uploadErr }) => {
              if (uploadErr) {
                console.error('[AudioTranscriptionPanel] Failed to back up interrupted recording:', uploadErr)
              } else {
                console.warn(`[AudioTranscriptionPanel] Recording was interrupted mid-session; backed up to storage at meeting-audio/${fileName}`)
              }
            })
        }
        mediaRecorder.current.stop()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  // Notify parent when recording state changes
  useEffect(() => {
    onRecordingChange?.(isRecordingNow)
  }, [isRecordingNow, onRecordingChange])

  // Load existing transcriptions for this meeting on mount
  useEffect(() => {
    fetchTranscriptions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId])

  async function fetchTranscriptions() {
    try {
      const { data, error } = await supabase
        .from('meeting_transcriptions')
        .select('id, input_type, input_file_name, summary, sequence_number, created_at')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false })
      if (!error && data) {
        const storagePathRe = /^[0-9a-f]{8}-[0-9a-f-]{27,}-\d+\.[a-z0-9]+$/i
        const isStoragePath = (fn) => fn && storagePathRe.test(fn)
        const seen = new Set()
        const deduped = []
        for (const row of data) {
          const humanName = !isStoragePath(row.input_file_name) ? row.input_file_name : null
          const key = humanName || (row.summary || '').slice(0, 120) || row.id
          if (!seen.has(key)) {
            seen.add(key)
            deduped.push(row)
          }
        }
        deduped.sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0))
        setTranscriptions(deduped)
      }
    } catch (err) {
      console.warn('Failed to load transcriptions:', err)
    }
  }

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
    const files = Array.from(e.target.files || [])
    if (files.length === 1) {
      acceptFile(files[0])
    } else if (files.length > 1) {
      acceptFiles(files)
    }
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
    if (audioFile) {
      // already have one — add to queue instead of replacing
      setAudioQueue(prev => {
        const existing = prev.some(f => f.name === file.name && f.size === file.size)
        if (existing) return prev
        return [...prev, file]
      })
    } else {
      setAudioFile(file)
      setAudioPreview(URL.createObjectURL(file))
    }
  }

  const acceptFiles = (files) => {
    setError('')
    const valid = []
    for (const file of files) {
      if (!isAudioType(file.type)) { setError(`Skipped ${file.name}: unsupported type.`); continue }
      if (file.size > MAX_SIZE) { setError(`Skipped ${file.name}: too large.`); continue }
      valid.push(file)
    }
    if (!valid.length) return
    setAudioFile(valid[0])
    setAudioPreview(URL.createObjectURL(valid[0]))
    if (valid.length > 1) setAudioQueue(valid.slice(1))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (!files.length) return
    setMode('upload')
    if (files.length === 1) acceptFile(files[0])
    else acceptFiles(files)
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
        setActionAssignments(result.action_items.map((item) => resolveAssignment(item, directory)))
      } else {
        setActionAssignments([])
      }
      setSelectedOpenItems(result.open_items?.length ? autoSelectOpenItems(result.open_items) : new Set())
      setOpenItemsMergeSuccess(false)
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
    setExtractError(null)
    setActionAssignments([])

    // Org directory drives both the AI's space-suggestion context (linked_spaces/
    // participants) and the client-side owner/space matching once results land.
    // If fetching fails (e.g. transient network blip), degrade gracefully with
    // empty arrays rather than hanging the UI with an unhandled rejection.
    let departments = []
    let users = []
    try {
      [departments, users] = await Promise.all([getOrgDepartments(), getOrgUsers()])
      setOrgDirectory({ departments, users })
    } catch (err) {
      console.warn('[AudioTranscriptionPanel] Failed to load org directory for extraction context:', err.message)
      setOrgDirectory({ departments: [], users: [] })
    }

    const directory = { departments, users }
    const deptNameById = Object.fromEntries(departments.map((d) => [d.id, d.name]))
    const linkedSpaces = departments.map((d) => d.name)
    const participants = users.map((u) => {
      const space = deptNameById[u.department_id] ?? null
      return { name: u.name, spaces: space ? [space] : [], primary: space }
    })

    let fetchAbort = null
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session?.access_token) {
        throw new Error('Session expired. Please log in again.')
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      fetchAbort = new AbortController()
      const response = await fetch(`${supabaseUrl}/functions/v1/extract-meeting-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          transcript: transcriptText,
          context: meetingContext || '',
          linked_spaces: linkedSpaces,
          participants,
          stream: true,
          meetingId,
        }),
        signal: fetchAbort.signal,
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

        // Stream closed without a done event — server was cut short (wall-clock kill,
        // network drop, etc.). Throw so the catch block runs the non-streaming fallback
        // instead of silently returning with no results and no error shown to the user.
        if (!receivedDone) {
          throw new Error('Extraction stream ended without a completion event — falling back to non-streaming.')
        }
      }

      await withTimeout(streamingLoop(), 300_000, 'streamExtractMeetingData')
    } catch (err) {
      fetchAbort?.abort()
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
          { body: { transcript: transcriptText, context: meetingContext || '', linked_spaces: linkedSpaces, participants, meetingId } }
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
              extractData.extracted.action_items.map((item) => resolveAssignment(item, directory)),
            )
          }
          if (extractData.extracted.open_items?.length) {
            const autoSelected = new Set()
            extractData.extracted.open_items.forEach((item, i) => {
              if ((item.confidence_score ?? 0) >= 0.80) autoSelected.add(i)
            })
            setSelectedOpenItems(autoSelected)
          }
          setOpenItemsMergeSuccess(false)
          if (isTimeout) setError('')
        } else if (extractErr) {
          setExtractError('AI extraction failed. Your transcript was saved — click Retry to try again.')
        }
      } catch (fallbackErr) {
        console.warn('[streamExtract] Fallback also failed:', fallbackErr)
        setExtractError('AI extraction is unavailable right now. Your transcript was saved — click Retry to try again.')
      }
    } finally {
      setExtracting(false)
    }
  }

  // ── Transcript persistence ────────────────────────────────────────────────────

  // Appends a new segment to the meeting transcript — always reads the current
  // full text from the DB instead of rebuilding from meeting_transcriptions.summary,
  // which is capped at 500 chars and would truncate every segment except the last.
  // NOTE: When adding multiple segments in "add more" mode, only return the new segment
  // for extraction — don't re-process previously added segments.
  const appendSegmentToMeeting = async (inputType, fileName, transcript) => {
    let existingSummary = ''
    let existingCount = 0
    try {
      const [mtgRes, countRes] = await Promise.all([
        supabase.from('meetings').select('summary').eq('id', meetingId).single(),
        supabase.from('meeting_transcriptions')
          .select('id', { count: 'exact', head: true })
          .eq('meeting_id', meetingId),
      ])
      existingSummary = mtgRes.data?.summary ?? ''
      existingCount = countRes.count ?? 0
    } catch {}

    const segNum = existingCount + 1
    const { data: record, error: recErr } = await supabase
      .from('meeting_transcriptions')
      .insert([{
        meeting_id: meetingId,
        input_type: inputType,
        input_file_name: fileName,
        summary: transcript.slice(0, 500),
        status: 'complete',
        tokens_used: 0,
        created_by: profile?.id,
        processed_at: new Date().toISOString(),
        sequence_number: segNum - 1,
      }])
      .select()
      .single()
    if (recErr) console.warn('Transcription record save failed:', recErr)

    if (record) setTranscriptions(prev => [...prev, record])

    const segHeader = `[Segment ${segNum}${fileName ? ` - ${fileName}` : ''}]`
    const concatenatedTranscript = existingSummary
      ? `${existingSummary}\n\n---\n\n${segHeader}\n${transcript}`
      : `${segHeader}\n${transcript}`

    await supabase.from('meetings').update({ summary: concatenatedTranscript }).eq('id', meetingId)

    // Return ONLY the new segment for extraction, not the concatenated full text.
    // This prevents re-extraction of previously processed segments when adding more.
    const newSegmentOnly = `${segHeader}\n${transcript}`
    return { record, concatenatedTranscript, newSegmentOnly }
  }

  // ── Transcription ─────────────────────────────────────────────────────────────

  const handleTranscribe = async () => {
    if (!audioFile) { setError('No audio selected.'); return }
    const continuingQueue = isQueueContinuation.current
    isQueueContinuation.current = false
    setTranscribing(true)
    setProgress(0)
    setChunkStatus('')
    setError('')
    // When continuing from a multi-file queue, keep the accumulated transcript visible
    // instead of blanking it for the full duration of the next file's upload + transcription.
    if (!continuingQueue) {
      setTranscript('')
      setExtractedData(null)
      setMergeSuccess(false)
    }

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

      const { record, concatenatedTranscript, newSegmentOnly } = await appendSegmentToMeeting(
        'audio', originalName, transcript,
      )

      setProgress(100)
      setChunkStatus('')

      // If more files are queued, process the next one
      if (audioQueue.length > 0) {
        const [nextFile, ...remaining] = audioQueue
        setAudioFile(nextFile)
        setAudioPreview(URL.createObjectURL(nextFile))
        setAudioQueue(remaining)
        setTranscript(concatenatedTranscript)
        setTranscribing(false)
        isQueueContinuation.current = true
        // Use the ref so the next render's closure (with updated audioFile/audioQueue) runs, not this one's
        setTimeout(() => handleTranscribeRef.current?.(), 100)
        return
      }

      // All files done — show the combined transcript and extract from everything
      setTranscript(concatenatedTranscript)
      setShowAddMore(false)

      onTranscriptionComplete?.({ transcript: concatenatedTranscript, record, extracted: null })

      // WIN 3: stream extraction asynchronously using ONLY the new segment
      // (avoid re-extracting previously added segments in "add more" mode)
      streamExtractMeetingData(newSegmentOnly)
    } catch (err) {
      setError(err.message || 'Transcription failed.')
    } finally {
      setTranscribing(false)
    }
  }
  // Keep ref current so the queue timer always calls the latest closure (avoids stale audioFile/audioQueue)
  handleTranscribeRef.current = handleTranscribe

  const saveTranscriptText = async (transcriptText) => {
    const { record, concatenatedTranscript, newSegmentOnly } = await appendSegmentToMeeting(
      'text', 'pasted-transcript', transcriptText,
    )
    return { record, concatenatedTranscript, newSegmentOnly }
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
      const { record, concatenatedTranscript } = await saveTranscriptText(transcriptText)
      setProgress(100)
      setTranscript(concatenatedTranscript)
      setShowAddMore(false)
      onTranscriptionComplete?.({ transcript: concatenatedTranscript, record, extracted: null })
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

      // Save first so AI Extract always has the text
      setProgress(60)
      const { record, concatenatedTranscript, newSegmentOnly } = await saveTranscriptText(transcriptText)

      setProgress(100)
      setTranscript(concatenatedTranscript)
      setShowAddMore(false)
      onTranscriptionComplete?.({ transcript: concatenatedTranscript, record, extracted: null })

      // WIN 3: stream extraction asynchronously using ONLY the new segment
      // (avoid re-extracting previously added segments in "add more" mode)
      streamExtractMeetingData(newSegmentOnly)
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
            title: assignment.title ?? item.title,
            assigneeId: assignment.assigneeId ?? null,
            departmentId: assignment.departmentId ?? null,
            sprintId: assignment.sprintId ?? null,
            dueDate: extractISODate(assignment.due_date ?? item.due_date),
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

  // ── Merge open items → meeting_open_items ──────────────────────────────────

  const handleMergeOpenItems = async () => {
    if (!extractedData?.open_items?.length) return
    setMergingOpenItems(true)
    setError('')
    try {
      const items = extractedData.open_items
        .filter((_, i) => selectedOpenItems.has(i))
        .map((item) => ({
          item_text: item.item_text,
          item_type: item.item_type || 'exploration',
          transcript_excerpt: item.transcript_excerpt || null,
          confidence_score: item.confidence_score ?? null,
        }))
      if (!items.length) { setMergingOpenItems(false); return }
      await createOpenItems(meetingId, departmentId, items, profile?.id)
      setOpenItemsMergeSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to save open items.')
    } finally {
      setMergingOpenItems(false)
    }
  }

  const toggleOpenItem = (i) => {
    setSelectedOpenItems((prev) => {
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
    if (!showAddMore) {
      if (!recordOnly && canRecord) onCollapse?.()
      setMode(recordOnly ? 'record' : canRecord ? null : 'upload')
    } else {
      // In "add more" mode, stay in the same mode for next recording
      setAudioFile(null)
      setAudioPreview(null)
      setPastedText('')
      setTranscript('')
      setRecordingTime(0)
      setProgress(0)
      setChunkStatus('')
      setError('')
      setMergeSuccess(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setAudioFile(null)
    setAudioPreview(null)
    setAudioQueue([])
    setPastedText('')
    setTranscript('')
    setExtractedData(null)
    setExtractError(null)
    setRecordingTime(0)
    setProgress(0)
    setChunkStatus('')
    setError('')
    setMergeSuccess(false)
    setSelectedActionItems(new Set())
    setActionAssignments([])
    setSelectedOpenItems(new Set())
    setOpenItemsMergeSuccess(false)
    setShowAddMore(false)
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
    btn: { flex: 1, padding: '10px 16px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .2s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
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
        {transcriptions.length > 0 && (
          <button
            type="button"
            onClick={() => setShowUploadHistory((visible) => !visible)}
            style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: '0 2px', color: '#4C2A92', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
          >
            {showUploadHistory ? 'Hide audio sources' : `View ${transcriptions.length} audio source${transcriptions.length === 1 ? '' : 's'}`}
          </button>
        )}
        {/* Show existing transcriptions so they're visible before picking a mode */}
        {transcriptions.length > 0 && showUploadHistory && (
          <div style={s.card}>
            <h3 style={s.title}>Audio uploads ({transcriptions.length})</h3>
            {transcriptions.map((t, idx) => (
              <div key={t.id} style={{ marginBottom: 12, padding: 10, background: '#fff', borderRadius: 6, border: '1px solid #E9E4D8' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#2D2A22', marginBottom: 4 }}>
                  {displayAudioUploadName(t.input_file_name, idx)}
                </div>
                <div style={{ fontSize: 12, color: '#7A6F5E', marginBottom: 6 }}>
                  {new Date(t.created_at).toLocaleString()} • {t.input_type}
                </div>
                <div style={{ ...s.transcriptBox, maxHeight: 80, fontSize: 12 }}>{t.summary.slice(0, 200)}{t.summary.length > 200 ? '...' : ''}</div>
              </div>
            ))}
          </div>
        )}
        <div style={s.card}>
          <h3 style={s.title}>{transcriptions.length > 0 ? 'Add another audio upload' : 'Transcribe Meeting Audio'}</h3>
          <p style={s.sub}>{transcriptions.length > 0 ? 'Upload, record, or paste another meeting recording or transcript' : 'Upload a recording, record live, or paste an existing transcript'}</p>
          <div style={{ ...s.modeGrid, gridTemplateColumns: gridCols }}>
            <button
              style={s.modeBtn}
              onClick={() => { setMode('upload'); onExpand?.() }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#F5F2ED' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.background = '#fff' }}
            >
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: '#4C2A92' }}><FolderOpen size={25} aria-hidden="true" /></div>
              <div>Upload file</div>
              <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 4 }}>MP3, WAV, M4A • max 300 MB</div>
            </button>
            {canRecord && (
              <button
                style={s.modeBtn}
                onClick={() => { setMode('record'); onExpand?.() }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#F5F2ED' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.background = '#fff' }}
              >
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: '#4C2A92' }}><Mic size={25} aria-hidden="true" /></div>
                <div>Record live</div>
                <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 4 }}>Capture audio now</div>
              </button>
            )}
            <button
              style={s.modeBtn}
              onClick={() => { setMode('paste'); onExpand?.() }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#F5F2ED' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.background = '#fff' }}
            >
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: '#4C2A92' }}><FileText size={25} aria-hidden="true" /></div>
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
        {!recordOnly && !showAddMore && <button style={s.backBtn} onClick={reset}>← Back</button>}

        {/* Show existing transcriptions */}
        {transcriptions.length > 0 && showUploadHistory && (
          <div style={s.card}>
            <h3 style={s.title}>Audio uploads ({transcriptions.length})</h3>
            {transcriptions.map((t, idx) => (
              <div key={t.id} style={{ marginBottom: 12, padding: 10, background: '#fff', borderRadius: 6, border: '1px solid #E9E4D8' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#2D2A22', marginBottom: 4 }}>
                  {displayAudioUploadName(t.input_file_name, idx)}
                </div>
                <div style={{ fontSize: 12, color: '#7A6F5E', marginBottom: 6 }}>
                  {new Date(t.created_at).toLocaleString()} • {t.input_type}
                </div>
                <div style={{ ...s.transcriptBox, maxHeight: 120, fontSize: 12 }}>{t.summary.slice(0, 200)}{t.summary.length > 200 ? '...' : ''}</div>
              </div>
            ))}
          </div>
        )}

        <div style={s.card}>
          <h3 style={s.title}>{showAddMore ? 'Record another audio upload' : 'Record live audio'}</h3>
          {isRecordingNow && (
            <div style={s.recIndicator}>
              <div style={s.dot} /> Recording in progress
            </div>
          )}
          {!isRecordingNow && !audioPreview && (
            <p style={s.sub}>{showAddMore ? 'Add another audio upload to your meeting.' : 'Click start to record from your microphone.'}</p>
          )}
          {!isRecordingNow && audioPreview && (
            <p style={s.sub}>Preview your recording before transcribing.</p>
          )}
          <div style={s.timer}>{formatTime(recordingTime)}</div>
          {audioPreview && <audio src={audioPreview} controls style={{ width: '100%', marginBottom: 12 }} />}
          {error && <div style={s.error}>{error}</div>}
          <div style={s.btnGroup}>
            {isRecordingNow ? (
              <button style={{ ...s.btn, ...s.btnDanger }} onClick={handleStopRecording}><Square size={14} fill="currentColor" aria-hidden="true" /> Stop recording</button>
            ) : audioPreview ? (
              <>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleTranscribe} disabled={transcribing}>
                  {transcribing ? <><LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Transcribing...</> : <><Sparkles size={14} aria-hidden="true" /> Transcribe</>}
                </button>
                <button style={{ ...s.btn, ...s.btnSecondary }} onClick={reset}>Clear</button>
              </>
            ) : (
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleStartRecording}><Mic size={14} aria-hidden="true" /> Start recording</button>
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

        {transcript && !showAddMore && (
          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h3 style={{ ...s.title, marginBottom: 0 }}>Transcription complete</h3>
            </div>
            <div style={s.btnGroup}>
              <button
                style={{ ...s.btn, ...s.btnPrimary }}
                onClick={() => setShowAddMore(true)}
              >
                <Plus size={14} aria-hidden="true" /> Add more audio
              </button>
              <button
                style={{ ...s.btn, ...s.btnSecondary }}
                onClick={() => setShowAddMore(false)}
              >
                ✓ Done adding
              </button>
            </div>
          </div>
        )}

        {transcript && showAddMore && (
          <div style={s.card}>
            <p style={s.sub}>Record another upload above, or click "Done adding" when finished.</p>
          </div>
        )}

        {transcript && !showAddMore && <TranscriptCard transcript={transcript} extractedData={extractedData} extracting={extracting} extractError={extractError} onRetryExtract={() => streamExtractMeetingData(transcript)} selectedItems={selectedActionItems} toggleItem={toggleItem} onMerge={handleMerge} merging={merging} mergeSuccess={mergeSuccess} selectedOpenItems={selectedOpenItems} toggleOpenItem={toggleOpenItem} onMergeOpenItems={handleMergeOpenItems} mergingOpenItems={mergingOpenItems} openItemsMergeSuccess={openItemsMergeSuccess} error={error} s={s} orgDirectory={orgDirectory} departmentId={departmentId} assignments={actionAssignments} onAssignmentChange={handleAssignmentChange} canManage={canManage} />}
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} } @keyframes spin { to{transform:rotate(360deg)} }`}</style>
      </div>
    )
  }

  // ── Upload mode ───────────────────────────────────────────────────────────────

  if (mode === 'upload') {
    return (
      <div style={s.container}>
        {canRecord && !showAddMore && <button style={s.backBtn} onClick={reset}>← Back</button>}

        {/* Show existing transcriptions */}
        {transcriptions.length > 0 && showUploadHistory && (
          <div style={s.card}>
            <h3 style={s.title}>Audio uploads ({transcriptions.length})</h3>
            {transcriptions.map((t, idx) => (
              <div key={t.id} style={{ marginBottom: 12, padding: 10, background: '#fff', borderRadius: 6, border: '1px solid #E9E4D8' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#2D2A22', marginBottom: 4 }}>
                  {displayAudioUploadName(t.input_file_name, idx)}
                </div>
                <div style={{ fontSize: 12, color: '#7A6F5E', marginBottom: 6 }}>
                  {new Date(t.created_at).toLocaleString()} • {t.input_type}
                </div>
                <div style={{ ...s.transcriptBox, maxHeight: 120, fontSize: 12 }}>{t.summary.slice(0, 200)}{t.summary.length > 200 ? '...' : ''}</div>
              </div>
            ))}
          </div>
        )}

        <div style={s.card}>
          <h3 style={s.title}>{showAddMore ? '📁 Upload next audio' : 'Upload audio file'}</h3>
          <p style={s.sub}>MP3, WAV, M4A, WebM — max 300 MB · select multiple files at once</p>
          <input type="file" multiple ref={fileInputRef} accept="audio/*" onChange={handleFileSelect} disabled={transcribing} style={{ display: 'none' }} id="audio-file-input" />
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
              ? `✅ ${audioFile instanceof File ? audioFile.name : 'recording.webm'}${audioQueue.length > 0 ? ` + ${audioQueue.length} more` : ''}`
              : dragOver ? '📂 Drop to upload' : '🎵 Click to choose or drag & drop · select multiple files at once'}
          </label>

          {/* Current file */}
          {audioFile && (
            <div style={s.fileInfo}>
              <span style={{ fontWeight: 600 }}>
                {transcribing ? '▶ ' : ''}
                {audioFile instanceof File ? audioFile.name : 'recording.webm'}
              </span>
              <span style={{ color: '#7A6F5E' }}>{((audioFile.size ?? 0) / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          )}

          {/* Queue of additional files */}
          {audioQueue.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {audioQueue.map((f, idx) => (
                <div key={idx} style={{ ...s.fileInfo, marginTop: 4, opacity: 0.6 }}>
                  <span>⏳ {f.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#7A6F5E' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      type="button"
                      onClick={() => setAudioQueue(prev => prev.filter((_, i) => i !== idx))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C73B2B', fontSize: 14, padding: '0 2px' }}
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {audioPreview && !transcribing && <audio src={audioPreview} controls style={{ width: '100%', marginTop: 12 }} />}
          {transcribing && (
            <>
              <div style={{ ...s.progressWrap, marginTop: 14 }}>
                <div style={{ ...s.progressFill, width: `${progress}%` }} />
              </div>
              <p style={{ ...s.sub, marginTop: 4 }}>
                {audioQueue.length > 0
                  ? `${progress}% — ${chunkStatus || 'Processing…'} (${audioQueue.length} file${audioQueue.length !== 1 ? 's' : ''} remaining)`
                  : `${progress}% — ${chunkStatus || (progress < 40 ? 'Uploading...' : progress < 70 ? 'Transcribing...' : 'Extracting data...')}`}
              </p>
            </>
          )}
          {audioFile && !transcribing && !transcript && (
            <div style={s.btnGroup}>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleTranscribe}>
                <><Sparkles size={14} aria-hidden="true" /> {audioQueue.length > 0 ? `Transcribe all (${audioQueue.length + 1})` : 'Transcribe'}</>
              </button>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={reset}>Clear</button>
            </div>
          )}
        </div>

        {transcript && !showAddMore && (
          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h3 style={{ ...s.title, marginBottom: 0 }}>Transcription complete</h3>
            </div>
            <div style={s.btnGroup}>
              <button
                style={{ ...s.btn, ...s.btnPrimary }}
                onClick={() => {
                  setShowAddMore(true)
                  // Clear the previous file so the next upload becomes primary rather than queuing behind it
                  setAudioFile(null)
                  setAudioPreview(null)
                  setAudioQueue([])
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              >
                <Plus size={14} aria-hidden="true" /> Add more audio
              </button>
            </div>
          </div>
        )}

        {transcript && showAddMore && (
          <div style={s.card}>
            <p style={s.sub}>Upload your next audio file above.</p>
          </div>
        )}

        {transcript && !showAddMore && <TranscriptCard transcript={transcript} extractedData={extractedData} extracting={extracting} extractError={extractError} onRetryExtract={() => streamExtractMeetingData(transcript)} selectedItems={selectedActionItems} toggleItem={toggleItem} onMerge={handleMerge} merging={merging} mergeSuccess={mergeSuccess} selectedOpenItems={selectedOpenItems} toggleOpenItem={toggleOpenItem} onMergeOpenItems={handleMergeOpenItems} mergingOpenItems={mergingOpenItems} openItemsMergeSuccess={openItemsMergeSuccess} error={error} s={s} orgDirectory={orgDirectory} departmentId={departmentId} assignments={actionAssignments} onAssignmentChange={handleAssignmentChange} canManage={canManage} />}
      </div>
    )
  }

  // ── Paste transcript mode ─────────────────────────────────────────────────────

  if (mode === 'paste') {
    return (
      <div style={s.container}>
        {!pasteOnly && !showAddMore && <button style={s.backBtn} onClick={reset}>← Back</button>}

        {/* Show existing transcriptions */}
        {transcriptions.length > 0 && showUploadHistory && (
          <div style={s.card}>
            <h3 style={s.title}>📚 Pasted Transcripts ({transcriptions.length})</h3>
            {transcriptions.map((t, idx) => (
              <div key={t.id} style={{ marginBottom: 12, padding: 10, background: '#fff', borderRadius: 6, border: '1px solid #E9E4D8' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#2D2A22', marginBottom: 4 }}>
                  Segment {idx + 1}
                </div>
                <div style={{ fontSize: 12, color: '#7A6F5E', marginBottom: 6 }}>
                  {new Date(t.created_at).toLocaleString()} • pasted text
                </div>
                <div style={{ ...s.transcriptBox, maxHeight: 120, fontSize: 12 }}>{t.summary.slice(0, 200)}{t.summary.length > 200 ? '...' : ''}</div>
              </div>
            ))}
          </div>
        )}

        <div style={s.card}>
          <h3 style={s.title}>{showAddMore ? '📋 Paste next transcript' : 'Paste transcript'}</h3>
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

        {transcript && !showAddMore && (
          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h3 style={{ ...s.title, marginBottom: 0 }}>Transcript saved</h3>
            </div>
            <div style={s.btnGroup}>
              <button
                style={{ ...s.btn, ...s.btnPrimary }}
                onClick={() => setShowAddMore(true)}
              >
                ➕ Add more transcript
              </button>
              <button
                style={{ ...s.btn, ...s.btnSecondary }}
                onClick={() => setShowAddMore(false)}
              >
                ✓ Done adding
              </button>
            </div>
          </div>
        )}

        {transcript && showAddMore && (
          <div style={s.card}>
            <p style={s.sub}>Paste your next transcript above, or click "Done adding" when finished.</p>
          </div>
        )}

        {transcript && !showAddMore && <TranscriptCard transcript={transcript} extractedData={extractedData} extracting={extracting} extractError={extractError} onRetryExtract={() => streamExtractMeetingData(transcript)} selectedItems={selectedActionItems} toggleItem={toggleItem} onMerge={handleMerge} merging={merging} mergeSuccess={mergeSuccess} selectedOpenItems={selectedOpenItems} toggleOpenItem={toggleOpenItem} onMergeOpenItems={handleMergeOpenItems} mergingOpenItems={mergingOpenItems} openItemsMergeSuccess={openItemsMergeSuccess} error={error} s={s} orgDirectory={orgDirectory} departmentId={departmentId} assignments={actionAssignments} onAssignmentChange={handleAssignmentChange} canManage={canManage} />}
      </div>
    )
  }

  return null
}

// ── Detailed notes (markdown) with inline scripture ──────────────────────────────

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Inline scripture citation with a confidence badge. Confirmed refs expose the
// verse text on hover; unconfirmed refs never show reconstructed text — the badge
// makes clear the wording wasn't verified.
function ScriptureChip({ refItem }) {
  const confirmed = refItem?.confidence === 'confirmed' && refItem?.verse_text
  return (
    <span
      title={confirmed ? refItem.verse_text : 'Citation not verified — verse text unconfirmed'}
      style={{
        fontWeight: 600,
        color: confirmed ? '#2E7D32' : '#9E5C3C',
        borderBottom: `1px dotted ${confirmed ? '#2E7D32' : '#9E5C3C'}`,
        cursor: 'help',
        whiteSpace: 'nowrap',
      }}
    >
      {refItem.citation}
      <sup style={{ fontSize: 9, marginLeft: 2 }}>{confirmed ? '✓' : '?'}</sup>
    </span>
  )
}

// Split a line into text, **bold**, and scripture-citation nodes so citations are
// highlighted inline exactly where they appear in the notes prose.
function tokenizeInline(text, refs) {
  const citations = (refs || []).map((r) => r?.citation).filter(Boolean)
  const alt = citations.map(escapeRegExp).sort((a, b) => b.length - a.length).join('|')
  const re = new RegExp(`\\*\\*(.+?)\\*\\*${alt ? `|(${alt})` : ''}`, 'g')
  const nodes = []
  let last = 0
  let key = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(<strong key={key++}>{m[1]}</strong>)
    } else if (m[2] !== undefined) {
      const ref = refs.find((r) => r.citation === m[2])
      nodes.push(<ScriptureChip key={key++} refItem={ref} />)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function DetailedNotes({ notes, scriptureRefs = [], s }) {
  const [open, setOpen] = useState(false)
  if (!notes || !notes.trim()) return null

  const lines = notes.split('\n')
  // Any citation the model didn't weave into the prose still gets surfaced inline
  // at the foot of the notes so no reference is silently dropped.
  const mentioned = new Set()
  const notesText = notes
  for (const r of scriptureRefs) {
    if (r?.citation && notesText.includes(r.citation)) mentioned.add(r.citation)
  }
  const unmentioned = scriptureRefs.filter((r) => r?.citation && !mentioned.has(r.citation))

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ ...s.extractLabel, background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {open ? '▾' : '▸'} Detailed Notes
      </button>
      {open && (
        <div style={{ ...s.transcriptBox, maxHeight: 360, marginTop: 8 }}>
          {lines.map((line, i) => {
            if (/^#{1,3}\s+/.test(line)) {
              return (
                <div key={i} style={{ fontWeight: 700, fontSize: 13, color: '#4C2A92', margin: '12px 0 4px' }}>
                  {line.replace(/^#{1,3}\s+/, '')}
                </div>
              )
            }
            if (line.trim() === '') return <div key={i} style={{ height: 6 }} />
            const isList = /^\s*[-*]\s+/.test(line)
            const content = isList ? line.replace(/^\s*[-*]\s+/, '') : line
            return (
              <p key={i} style={{ margin: isList ? '2px 0 2px 12px' : '4px 0', fontSize: 13, lineHeight: 1.6, color: '#2D2A22' }}>
                {isList ? '• ' : ''}
                {tokenizeInline(content, scriptureRefs)}
              </p>
            )
          })}
          {unmentioned.length > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#7A6F5E' }}>
              Also referenced:{' '}
              {unmentioned.map((r, i) => (
                <span key={r.citation}>
                  {i > 0 ? ', ' : ''}
                  <ScriptureChip refItem={r} />
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Transcript + extracted data card ─────────────────────────────────────────────
function TranscriptCard({ transcript, extractedData, extracting, extractError, onRetryExtract, selectedItems, toggleItem, onMerge, merging, mergeSuccess, selectedOpenItems, toggleOpenItem, onMergeOpenItems, mergingOpenItems, openItemsMergeSuccess, error, s, orgDirectory, departmentId, assignments, onAssignmentChange, canManage = true }) {
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

      {/* Spinner while streaming extraction runs */}
      {extracting && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#F0EBF8', borderRadius:6, marginTop:12 }}>
          <div style={{ width:20, height:20, border:'3px solid #E0E0E0', borderTopColor:'#4C2A92', borderRadius:'50%', animation:'spin 0.8s linear infinite', flexShrink:0 }} />
          <p style={{ margin:0, fontSize:13, color:'#4C2A92', fontWeight:600 }}>Extracting action items…</p>
        </div>
      )}

      {/* Extraction failed — visible failure state with retry */}
      {!extracting && extractError && !extractedData && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#FEE8E6', borderRadius:6, marginTop:12, border:'1px solid #F5C2BB' }}>
          <span style={{ fontSize:18, flexShrink:0 }}>⚠️</span>
          <div style={{ flex:1 }}>
            <p style={{ margin:'0 0 6px', fontSize:13, color:'#C73B2B', fontWeight:600 }}>AI extraction failed</p>
            <p style={{ margin:0, fontSize:12, color:'#8B2B1F' }}>{extractError}</p>
          </div>
          <button
            onClick={onRetryExtract}
            style={{ padding:'6px 14px', borderRadius:6, border:'none', background:'#C73B2B', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', flexShrink:0 }}
          >
            Retry
          </button>
        </div>
      )}

      {!extracting && extractedData && (
        <div style={s.extractSection}>
          <DetailedNotes notes={extractedData.detailed_notes} scriptureRefs={extractedData.scripture_references} s={s} />

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
                    >
                      <input type="checkbox" checked={selectedItems.has(i)} onChange={() => toggleItem(i)} style={{ marginTop: 2, cursor: 'pointer', accentColor: '#4C2A92' }} />
                      <div style={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
                        <input
                          value={assignment.title ?? item.title}
                          onChange={(e) => onAssignmentChange(i, 'title', e.target.value)}
                          style={{ width: '100%', fontWeight: 600, fontSize: 13, border: '1px solid transparent', borderRadius: 4, padding: '2px 4px', fontFamily: 'inherit', background: 'transparent', color: '#2D2A22' }}
                          onFocus={(e) => { e.target.style.border = '1px solid #E9E4D8'; e.target.style.background = '#fff' }}
                          onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent' }}
                        />
                        <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 2 }}>
                          AI suggested owner: {item.owner || 'TBD'}
                          {item.suggested_space ? ` · Space: ${item.suggested_space}` : ''}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{ display: 'flex', gap: 8, marginTop: 8, marginLeft: 26 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="date"
                        aria-label="Due date"
                        value={extractISODate(assignment.due_date ?? item.due_date) || ''}
                        onChange={(e) => onAssignmentChange(i, 'due_date', e.target.value)}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #E9E4D8', borderRadius: 6, background: '#fff', color: '#2D2A22' }}
                      />
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
                        onChange={(e) => {
                          // Changing the space invalidates a sprint picked from the
                          // previous space (sprints are space-scoped).
                          onAssignmentChange(i, 'departmentId', e.target.value)
                          if (assignment.sprintId) onAssignmentChange(i, 'sprintId', '')
                        }}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #E9E4D8', borderRadius: 6, background: '#fff', color: '#2D2A22' }}
                      >
                        <option value="">This meeting's space</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginTop: 8, marginLeft: 26 }} onClick={(e) => e.stopPropagation()}>
                      <SprintPicker
                        spaceId={assignment.departmentId || departmentId}
                        value={assignment.sprintId ?? ''}
                        onChange={(sprintId) => onAssignmentChange(i, 'sprintId', sprintId)}
                        placeholder="No sprint — space board only"
                        style={{ fontSize: 12 }}
                      />
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

          <OpenItemsConfirmation
            openItems={extractedData.open_items}
            selectedOpenItems={selectedOpenItems}
            toggleOpenItem={toggleOpenItem}
            onMergeOpenItems={onMergeOpenItems}
            mergingOpenItems={mergingOpenItems}
            openItemsMergeSuccess={openItemsMergeSuccess}
            s={s}
            canManage={canManage}
          />

          <DetectedEntitiesBadges entities={extractedData.detected_entities} />
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}
    </div>
  )
}

const TYPE_LABELS = {
  question: '❓ Question',
  exploration: '🔍 Exploration',
  blocker: '🚫 Blocker',
  decision_point: '⚖️ Decision Point',
  future_consideration: '💡 Future',
}

function OpenItemsConfirmation({ openItems, selectedOpenItems, toggleOpenItem, onMergeOpenItems, mergingOpenItems, openItemsMergeSuccess, s, canManage = true }) {
  const [showLow, setShowLow] = useState(false)

  if (!openItems?.length) return null

  const high = []
  const medium = []
  const low = []
  openItems.forEach((item, i) => {
    const score = item.confidence_score ?? 0
    if (score >= 0.80) high.push({ item, i })
    else if (score >= 0.60) medium.push({ item, i })
    else low.push({ item, i })
  })

  const renderItem = ({ item, i }) => (
    <label
      key={`open-item-${i}`}
      style={{
        ...s.checkRow,
        flexDirection: 'column',
        alignItems: 'stretch',
        borderLeft: `2px solid ${selectedOpenItems.has(i) ? '#2D8653' : 'transparent'}`,
        paddingLeft: 4,
      }}
      onClick={() => toggleOpenItem(i)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={selectedOpenItems.has(i)}
          onChange={() => toggleOpenItem(i)}
          style={{ marginTop: 2, cursor: 'pointer', accentColor: '#2D8653' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.item_text}</div>
          <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block',
              padding: '1px 6px',
              borderRadius: 4,
              background: '#E8F5E9',
              color: '#2D8653',
              fontSize: 10,
              fontWeight: 600,
            }}>
              {TYPE_LABELS[item.item_type] || item.item_type}
            </span>
            <span>Confidence: {Math.round((item.confidence_score ?? 0) * 100)}%</span>
          </div>
          {item.transcript_excerpt && (
            <div style={{ fontSize: 11, color: '#9A8F7E', marginTop: 4, fontStyle: 'italic' }}>
              "{item.transcript_excerpt.slice(0, 120)}{item.transcript_excerpt.length > 120 ? '…' : ''}"
            </div>
          )}
        </div>
      </div>
    </label>
  )

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ ...s.extractLabel, color: '#2D8653' }}>Open Discussion Items — select to track</div>

      {high.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#7A6F5E', fontWeight: 600, marginBottom: 4, marginTop: 8 }}>High confidence</div>
          {high.map(renderItem)}
        </>
      )}

      {medium.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#7A6F5E', fontWeight: 600, marginBottom: 4, marginTop: 12 }}>Medium confidence</div>
          {medium.map(renderItem)}
        </>
      )}

      {low.length > 0 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setShowLow(!showLow) }}
            style={{
              ...s.backBtn,
              marginTop: 12,
              color: '#7A6F5E',
              fontSize: 11,
            }}
          >
            {showLow ? '▾' : '▸'} Low confidence ({low.length})
          </button>
          {showLow && low.map(renderItem)}
        </>
      )}

      {openItemsMergeSuccess ? (
        <div style={s.success}>✅ {selectedOpenItems.size} open item{selectedOpenItems.size !== 1 ? 's' : ''} saved for tracking.</div>
      ) : canManage ? (
        <div style={{ ...s.btnGroup, marginTop: 12 }}>
          <button
            style={{
              ...s.btn,
              background: '#2D8653',
              color: '#fff',
              opacity: selectedOpenItems.size === 0 || mergingOpenItems ? 0.6 : 1,
            }}
            onClick={onMergeOpenItems}
            disabled={selectedOpenItems.size === 0 || mergingOpenItems}
          >
            {mergingOpenItems ? '⏳ Saving...' : `✓ Save ${selectedOpenItems.size} open item${selectedOpenItems.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#9A8F7E', marginTop: 12 }}>Only meeting editors can save open items.</div>
      )}
    </div>
  )
}

const ENTITY_BADGE_META = {
  testimonies: '🙏', pledges: '💰', teaching_sessions: '📖', announcements: '📢',
  attendance_metrics: '📊', recognition_segments: '🏆', campaigns: '🚀',
  strategic_initiatives: '🎯', budget_discussions: '💵', q_and_a: '❓', other: '📌',
}

function DetectedEntitiesBadges({ entities }) {
  if (!entities || typeof entities !== 'object') return null
  const types = Object.keys(entities).filter((k) => entities[k]?.detected && entities[k]?.count > 0)
  if (types.length === 0) return null

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#2D2A22', marginBottom: 6 }}>
        Detected Content
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {types.map((type) => {
          const icon = ENTITY_BADGE_META[type] || '📌'
          const label = type.replace(/_/g, ' ')
          const count = entities[type].count
          return (
            <span
              key={type}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 12,
                background: '#F3F0FF', border: '1px solid #E9E4F8',
                fontSize: 11, fontWeight: 500, color: '#4C2A92',
              }}
            >
              {icon} {label} <strong>{count}</strong>
            </span>
          )
        })}
      </div>
    </div>
  )
}
