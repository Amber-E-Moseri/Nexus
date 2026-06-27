import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { createTasksFromActionItems } from '../lib/meetings'

const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 'audio/webm']
const MAX_SIZE = 100 * 1024 * 1024

export default function AudioTranscriptionPanel({
  meetingId,
  departmentId,
  canRecord,
  onTranscriptionComplete,
  onActionItemsExtracted,
}) {
  const { profile } = useAuth()
  const [mode, setMode] = useState(null) // null | 'record' | 'upload'
  const [audioFile, setAudioFile] = useState(null)
  const [audioPreview, setAudioPreview] = useState(null)
  const [isRecordingNow, setIsRecordingNow] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [transcript, setTranscript] = useState('')
  const [extractedData, setExtractedData] = useState(null)

  // confirm-before-merge state
  const [selectedActionItems, setSelectedActionItems] = useState(new Set())
  const [merging, setMerging] = useState(false)
  const [mergeSuccess, setMergeSuccess] = useState(false)

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
    if (!file) return
    setError('')
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Invalid file type. Allowed: MP3, WAV, M4A, WebM.')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('File too large. Maximum 100 MB.')
      return
    }
    setAudioFile(file)
    setAudioPreview(URL.createObjectURL(file))
  }

  // ── Transcription ─────────────────────────────────────────────────────────────

  const handleTranscribe = async () => {
    if (!audioFile) { setError('No audio selected.'); return }
    setTranscribing(true)
    setProgress(0)
    setError('')
    setTranscript('')
    setExtractedData(null)
    setMergeSuccess(false)

    try {
      // Step 1: upload to Supabase storage
      setProgress(20)
      const fileName = `${meetingId}-${Date.now()}`
      const { data: upload, error: uploadErr } = await supabase.storage
        .from('meeting-audio')
        .upload(fileName, audioFile, { cacheControl: '3600', upsert: false })
      if (uploadErr) throw uploadErr

      // Step 2: Deepgram transcription
      setProgress(40)
      const { data: deepgramData, error: dgErr } = await supabase.functions.invoke(
        'transcribe-audio-deepgram',
        { body: { audioPath: upload.path } }
      )
      if (dgErr) throw dgErr
      if (!deepgramData?.transcript) throw new Error('No speech detected in audio.')

      setProgress(60)
      setTranscript(deepgramData.transcript)

      // Step 3: Claude extraction (server-side — no API key in browser)
      setProgress(75)
      const { data: extractData, error: extractErr } = await supabase.functions.invoke(
        'extract-meeting-data',
        { body: { transcript: deepgramData.transcript } }
      )
      if (extractErr) throw extractErr
      const extracted = extractData?.extracted ?? null
      setExtractedData(extracted)

      // Pre-select all action items for merge
      if (extracted?.action_items?.length) {
        setSelectedActionItems(new Set(extracted.action_items.map((_, i) => i)))
      }

      // Step 4: save transcription record
      setProgress(90)
      const { data: record, error: recErr } = await supabase
        .from('meeting_transcriptions')
        .insert([{
          meeting_id: meetingId,
          input_type: 'audio',
          input_file_name: audioFile.name ?? fileName,
          summary: deepgramData.transcript.slice(0, 500),
          status: 'complete',
          tokens_used: deepgramData.tokensUsed ?? 0,
          created_by: profile?.id,
          processed_at: new Date().toISOString(),
        }])
        .select()
        .single()
      if (recErr) console.warn('Transcription record save failed:', recErr)

      setProgress(100)
      onTranscriptionComplete?.({ transcript: deepgramData.transcript, record, extracted })
    } catch (err) {
      setError(err.message || 'Transcription failed.')
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
        .filter((_, i) => selectedActionItems.has(i))
        .map((item) => ({
          title: item.title,
          assigneeId: null,
          dueDate: item.due_date ?? null,
          description: item.owner && item.owner !== 'TBD' ? `Owner: ${item.owner}` : null,
        }))
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

  const reset = () => {
    setMode(null)
    setAudioFile(null)
    setAudioPreview(null)
    setTranscript('')
    setExtractedData(null)
    setRecordingTime(0)
    setProgress(0)
    setError('')
    setMergeSuccess(false)
    setSelectedActionItems(new Set())
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
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h3 style={s.title}>Transcribe Meeting Audio</h3>
          <p style={s.sub}>Upload a recording or record live from your microphone</p>
          <div style={{ ...s.modeGrid, gridTemplateColumns: canRecord ? '1fr 1fr' : '1fr' }}>
            <button
              style={s.modeBtn}
              onClick={() => setMode('upload')}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#F5F2ED' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.background = '#fff' }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
              <div>Upload file</div>
              <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 4 }}>MP3, WAV, M4A • max 100 MB</div>
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
        <button style={s.backBtn} onClick={reset}>← Back</button>
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
              <p style={{ ...s.sub, marginTop: 4 }}>{progress}% — {progress < 40 ? 'Uploading...' : progress < 70 ? 'Transcribing...' : 'Extracting data...'}</p>
            </>
          )}
        </div>
        {transcript && <TranscriptCard transcript={transcript} extractedData={extractedData} selectedItems={selectedActionItems} toggleItem={toggleItem} onMerge={handleMerge} merging={merging} mergeSuccess={mergeSuccess} error={error} s={s} />}
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
      </div>
    )
  }

  // ── Upload mode ───────────────────────────────────────────────────────────────

  if (mode === 'upload') {
    return (
      <div style={s.container}>
        <button style={s.backBtn} onClick={reset}>← Back</button>
        <div style={s.card}>
          <h3 style={s.title}>Upload audio file</h3>
          <p style={s.sub}>MP3, WAV, M4A, WebM — max 100 MB</p>
          <input type="file" ref={fileInputRef} accept="audio/*" onChange={handleFileSelect} disabled={transcribing} style={{ display: 'none' }} id="audio-file-input" />
          <label
            htmlFor="audio-file-input"
            style={s.fileLabel}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#F5F2ED'; e.currentTarget.style.color = '#4C2A92' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#7A6F5E' }}
          >
            {audioFile ? `📁 ${audioFile instanceof File ? audioFile.name : 'recording.webm'}` : '🎵 Choose file or drag & drop'}
          </label>
          {audioFile && (
            <div style={s.fileInfo}>
              <span>{audioFile instanceof File ? audioFile.name : 'recording.webm'}</span>
              <span style={{ color: '#7A6F5E' }}>{((audioFile.size ?? 0) / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          )}
          {audioPreview && <audio src={audioPreview} controls style={{ width: '100%', marginTop: 12 }} />}
          {error && <div style={s.error}>{error}</div>}
          {transcribing && (
            <>
              <div style={{ ...s.progressWrap, marginTop: 14 }}>
                <div style={{ ...s.progressFill, width: `${progress}%` }} />
              </div>
              <p style={{ ...s.sub, marginTop: 4 }}>{progress}% — {progress < 40 ? 'Uploading...' : progress < 70 ? 'Transcribing...' : 'Extracting data...'}</p>
            </>
          )}
          {audioFile && !transcribing && !transcript && (
            <div style={s.btnGroup}>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleTranscribe}>✨ Transcribe</button>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={reset}>Clear</button>
            </div>
          )}
        </div>
        {transcript && <TranscriptCard transcript={transcript} extractedData={extractedData} selectedItems={selectedActionItems} toggleItem={toggleItem} onMerge={handleMerge} merging={merging} mergeSuccess={mergeSuccess} error={error} s={s} />}
      </div>
    )
  }

  return null
}

// ── Transcript + extracted data card ─────────────────────────────────────────────
function TranscriptCard({ transcript, extractedData, selectedItems, toggleItem, onMerge, merging, mergeSuccess, error, s }) {
  return (
    <div style={s.card}>
      <h3 style={s.title}>Transcript</h3>
      <div style={s.transcriptBox}>{transcript}</div>

      {extractedData && (
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
                {extractedData.decisions.map((d, i) => (
                  <li key={i} style={{ padding: '6px 0', fontSize: 13, color: '#2D2A22', borderBottom: '1px solid #EDE8DC' }}>✓ {d}</li>
                ))}
              </ul>
            </>
          )}

          {extractedData.action_items?.length > 0 && (
            <>
              <div style={s.extractLabel}>Action items — select to add to board</div>
              {extractedData.action_items.map((item, i) => (
                <label key={i} style={{ ...s.checkRow, borderColor: selectedItems.has(i) ? '#4C2A92' : '#E9E4D8' }} onClick={() => toggleItem(i)}>
                  <input type="checkbox" checked={selectedItems.has(i)} onChange={() => toggleItem(i)} style={{ marginTop: 2, cursor: 'pointer', accentColor: '#4C2A92' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 2 }}>
                      Owner: {item.owner || 'TBD'}{item.due_date ? ` · Due ${item.due_date}` : ''}
                    </div>
                  </div>
                </label>
              ))}

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
