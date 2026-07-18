import { useState, useRef, useEffect } from 'react'
import { Mic, Square, Upload, AlertCircle, Check, X, Loader } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callFlockCRM } from '../../lib/flockSupabase'
import { FLOCK, flockCard } from '../../lib/flockSupabase'
import { useAuth } from '../../hooks/useAuth'
import { detectResult } from './FlockAiLogPanel'

const isAudioType = (type) => type.startsWith('audio/') || type === 'video/webm'
const MAX_SIZE = 50 * 1024 * 1024 // 50MB
const STORAGE_LIMIT = 49 * 1024 * 1024 // 49MB

export default function FlockVoiceInteractionLogger({ contactId, contactName, onSuccess, onClose }) {
  const { profile } = useAuth()
  const [mode, setMode] = useState('record')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioFile, setAudioFile] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')
  const [transcript, setTranscript] = useState('')
  const [extractedData, setExtractedData] = useState(null)
  const [selectedTodos, setSelectedTodos] = useState(new Set())
  const [saving, setSaving] = useState(false)

  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const recordingInterval = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (isRecording) {
      recordingInterval.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    } else {
      clearInterval(recordingInterval.current)
    }
    return () => clearInterval(recordingInterval.current)
  }, [isRecording])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunks.current = []
      recorder.ondataavailable = (e) => audioChunks.current.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
        setAudioFile(blob)
        stream.getTracks().forEach((t) => t.stop())
        setRecordingTime(0)
      }
      recorder.start()
      mediaRecorder.current = recorder
      setIsRecording(true)
      setError('')
    } catch (e) {
      setError('Could not access microphone: ' + (e.message || e))
    }
  }

  const stopRecording = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop()
      setIsRecording(false)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isAudioType(file.type)) {
      setError('Please select an audio file (MP3, WAV, M4A, WebM, etc.)')
      return
    }
    if (file.size > MAX_SIZE) {
      setError(`File too large (max ${MAX_SIZE / 1024 / 1024}MB)`)
      return
    }
    setAudioFile(file)
    setError('')
  }

  const transcribeAudio = async () => {
    if (!audioFile || transcribing) return

    setTranscribing(true)
    setError('')
    setTranscript('')

    const audioPath = `private/flock-${profile.id}-${Date.now()}.webm`
    let uploaded = false

    try {
      const { error: uploadError } = await supabase.storage
        .from('meeting-audio')
        .upload(audioPath, audioFile, { upsert: false })
      if (uploadError) throw new Error('Upload failed: ' + uploadError.message)
      uploaded = true

      const response = await fetch('/functions/v1/transcribe-audio-deepgram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        },
        body: JSON.stringify({ audioPath }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Transcription failed (${response.status})`)
      }

      const result = await response.json()
      const transcriptText = result.transcript || ''

      if (!transcriptText.trim()) {
        throw new Error('Transcription was empty — please check the audio quality')
      }

      setTranscript(transcriptText)
      await extractTodos(transcriptText)
    } catch (e) {
      setError(e.message || 'Transcription failed')
      setTranscript('')
    } finally {
      setTranscribing(false)
      if (uploaded) {
        supabase.storage.from('meeting-audio').remove([audioPath]).catch(() => {})
      }
    }
  }

  const extractTodos = async (transcriptText) => {
    setExtracting(true)
    try {
      const response = await fetch('/functions/v1/extract-flock-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        },
        body: JSON.stringify({
          transcript: transcriptText,
          contactName: contactName,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Extraction failed (${response.status})`)
      }

      const data = await response.json()
      setExtractedData(data)
      // Pre-select all suggested todos
      setSelectedTodos(new Set(data.suggested_todos?.map((_, i) => i) || []))
    } catch (e) {
      console.error('Extraction error:', e)
      setExtractedData({
        summary: 'Could not extract suggestions',
        suggested_todos: [],
        next_action: null,
      })
    } finally {
      setExtracting(false)
    }
  }

  const saveInteractionAndTodos = async () => {
    if (!extractedData) {
      setError('No extracted data to save')
      return
    }

    const selectedList = Array.from(selectedTodos)
      .map((idx) => extractedData.suggested_todos[idx])
      .filter((t) => t && t.text.trim())

    setSaving(true)
    setError('')
    try {
      // Step 1: save interaction (updates next_due_date automatically)
      const interactionRes = await callFlockCRM('saveInteraction', {
        payload: JSON.stringify({
          personId: contactId,
          fullName: contactName,
          result: detectResult(transcript.toLowerCase()),
          summary: transcript,
          nextAction: selectedList.length ? 'Follow-up' : 'None',
          nextActionDateTime: '',
          loggedBy: profile?.name || profile?.email || 'Regional Secretary',
        }),
      })
      if (!interactionRes || interactionRes.success !== true) {
        throw new Error((interactionRes && interactionRes.error) || 'Save failed')
      }

      // Step 2: save todos (non-critical — show partial-success if this fails)
      if (selectedList.length) {
        try {
          await callFlockCRM('saveTodos', {
            payload: JSON.stringify({
              interactionId: interactionRes.interactionId,
              personId: contactId,
              personName: contactName,
              todos: selectedList.map((t) => ({
                text: t.text.trim(),
                dueDate: t.due_date_hint || '',
              })),
            }),
          })
        } catch {
          setError('Interaction logged, but follow-up todos couldn\'t be saved. Add them manually in the Todos tab.')
          setSaving(false)
          return
        }
      }

      if (onSuccess) onSuccess()
    } catch (e) {
      setError('Error saving: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const labelStyle = { fontSize: '12px', fontWeight: 700, color: FLOCK.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }

  if (extractedData && transcript) {
    return (
      <div style={{ display: 'grid', gap: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Transcript</h3>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: FLOCK.muted, lineHeight: 1.5 }}>{transcript}</p>
        </div>

        {extractedData.summary && (
          <div style={flockCard({ padding: '12px 14px', background: FLOCK.purpleTint, borderColor: 'transparent' })}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: FLOCK.purple, marginBottom: '4px' }}>Summary</div>
            <p style={{ margin: 0, fontSize: '13px', color: FLOCK.text }}>{extractedData.summary}</p>
          </div>
        )}

        {extractedData.suggested_todos?.length > 0 && (
          <div>
            <label style={labelStyle}>Suggested follow-ups</label>
            <div style={{ display: 'grid', gap: '6px' }}>
              {extractedData.suggested_todos.map((todo, idx) => (
                <label key={idx} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', fontSize: '13px', color: FLOCK.text, background: FLOCK.surface, padding: '9px 11px', borderRadius: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedTodos.has(idx)}
                    onChange={(e) => {
                      const newSet = new Set(selectedTodos)
                      if (e.target.checked) newSet.add(idx)
                      else newSet.delete(idx)
                      setSelectedTodos(newSet)
                    }}
                    style={{ marginTop: '2px' }}
                  />
                  <span>
                    <span style={{ opacity: selectedTodos.has(idx) ? 1 : 0.5 }}>{todo.text}</span>
                    {todo.due_date_hint && <span style={{ fontSize: '12px', color: FLOCK.muted, marginLeft: '6px' }}>— {todo.due_date_hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ ...flockCard({ padding: '12px 14px', background: FLOCK.redTint, borderColor: 'transparent' }), color: FLOCK.red, display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={saveInteractionAndTodos}
            disabled={saving || !selectedTodos.size}
            style={{ padding: '11px 20px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving || !selectedTodos.size ? 0.7 : 1, fontFamily: FLOCK.fontBody }}
          >
            {saving ? 'Saving…' : 'Save selected'}
          </button>
          <button
            type="button"
            onClick={() => {
              setTranscript('')
              setExtractedData(null)
              setAudioFile(null)
              setSelectedTodos(new Set())
              setError('')
              setRecordingTime(0)
            }}
            style={{ padding: '11px 20px', background: FLOCK.card, color: FLOCK.muted, border: `1px solid ${FLOCK.border}`, borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: FLOCK.fontBody }}
          >
            Record again
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '11px 20px', background: FLOCK.card, color: FLOCK.muted, border: `1px solid ${FLOCK.border}`, borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: FLOCK.fontBody }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Mic size={18} color={FLOCK.purple} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Voice log for {contactName}</h3>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: FLOCK.muted }}>Record or upload a note about this contact interaction.</p>
      </div>

      {error && (
        <div style={{ ...flockCard({ padding: '12px 14px', background: FLOCK.redTint, borderColor: 'transparent' }), color: FLOCK.red, display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      <div style={flockCard({ padding: '16px', display: 'grid', gap: '12px' })}>
        {/* Record tab */}
        {mode === 'record' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', background: isRecording ? FLOCK.redTint : FLOCK.purpleTint, border: `1px solid ${isRecording ? FLOCK.red + '44' : FLOCK.purple + '44'}`, transition: 'background 0.2s' }}>
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '8px 14px',
                  border: 'none',
                  borderRadius: '8px',
                  background: isRecording ? FLOCK.red : FLOCK.purple,
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FLOCK.fontBody,
                }}
              >
                {isRecording ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Start recording</>}
              </button>
              <span style={{ fontSize: '12px', color: isRecording ? FLOCK.red : FLOCK.purple, fontWeight: 600 }}>
                {isRecording ? `Recording… ${formatTime(recordingTime)}` : audioFile ? 'Ready to transcribe' : 'Tap to start'}
              </span>
              {isRecording && (
                <span style={{ marginLeft: 'auto', display: 'flex', gap: '3px', alignItems: 'center' }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ display: 'block', width: '4px', borderRadius: '2px', background: FLOCK.red, animation: `pulse-bar 0.8s ease-in-out ${i * 0.15}s infinite alternate`, height: `${10 + i * 4}px` }} />
                  ))}
                </span>
              )}
            </div>

            {audioFile && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', background: FLOCK.surface, borderRadius: '8px', fontSize: '13px', color: FLOCK.text }}>
                <Check size={16} color={FLOCK.green} />
                Audio ready
              </div>
            )}
          </>
        )}

        {/* Upload tab */}
        {mode === 'upload' && (
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 16px', border: `2px dashed ${FLOCK.border}`, borderRadius: '8px', cursor: 'pointer', background: FLOCK.surface }}>
            <Upload size={24} color={FLOCK.purple} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: FLOCK.text }}>Upload audio file</div>
              <div style={{ fontSize: '12px', color: FLOCK.muted, marginTop: '2px' }}>MP3, WAV, M4A, WebM (max 50MB)</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </label>
        )}

        {/* Mode selector */}
        {!audioFile && (
          <div style={{ display: 'flex', gap: '8px', borderBottom: `1px solid ${FLOCK.border}`, marginBottom: '4px' }}>
            <button
              type="button"
              onClick={() => setMode('record')}
              style={{
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                borderBottom: mode === 'record' ? `2px solid ${FLOCK.purple}` : 'none',
                color: mode === 'record' ? FLOCK.purple : FLOCK.muted,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: FLOCK.fontBody,
              }}
            >
              Record
            </button>
            <button
              type="button"
              onClick={() => setMode('upload')}
              style={{
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                borderBottom: mode === 'upload' ? `2px solid ${FLOCK.purple}` : 'none',
                color: mode === 'upload' ? FLOCK.purple : FLOCK.muted,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: FLOCK.fontBody,
              }}
            >
              Upload
            </button>
          </div>
        )}

        {/* Transcribe button */}
        {audioFile && !transcript && (
          <button
            type="button"
            onClick={transcribeAudio}
            disabled={transcribing}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: FLOCK.purple,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: transcribing ? 'wait' : 'pointer',
              opacity: transcribing ? 0.7 : 1,
              fontFamily: FLOCK.fontBody,
            }}
          >
            {transcribing && <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />}
            {transcribing ? 'Transcribing…' : 'Transcribe & extract'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes pulse-bar {
          from { opacity: 0.5; transform: scaleY(0.7); }
          to   { opacity: 1; transform: scaleY(1.1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
