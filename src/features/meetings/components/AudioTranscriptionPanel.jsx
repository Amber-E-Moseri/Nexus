import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { createTasksFromActionItems } from '../lib/meetings'

const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 'audio/webm']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

export default function AudioTranscriptionPanel({ meetingId, departmentId, canRecord, onActionItemsExtracted }) {
  const { profile } = useAuth()
  const isMobile = useMediaQuery('(max-width: 640px)')

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioURL, setAudioURL] = useState(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)

  // Upload/file state
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileError, setFileError] = useState(null)

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionProgress, setTranscriptionProgress] = useState(0)
  const [transcription, setTranscription] = useState(null)
  const [extractedItems, setExtractedItems] = useState(null)
  const [transcriptionError, setTranscriptionError] = useState(null)

  // Preview/merge state
  const [showPreview, setShowPreview] = useState(false)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [isMerging, setIsMerging] = useState(false)

  const fileInputRef = useRef(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  // Update recording time
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(audioBlob)
        setAudioURL(url)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      setRecordingTime(0)
    } catch (error) {
      setTranscriptionError('Microphone access denied. Check browser permissions.')
      console.error('Microphone error:', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileError(null)

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Invalid audio format. Allowed: MP3, WAV, M4A, WebM')
      return
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setFileError('File too large (max 100 MB)')
      return
    }

    setSelectedFile(file)
  }

  const transcribeAudio = async (audioFile) => {
    setIsTranscribing(true)
    setTranscriptionProgress(0)
    setTranscriptionError(null)
    setExtractedItems(null)

    try {
      const formData = new FormData()
      formData.append('audio', audioFile)
      formData.append('meetingId', meetingId)

      // Call Deepgram edge function via Supabase
      setTranscriptionProgress(10)
      const { data: result, error: transcribeError } = await supabase.functions.invoke(
        'transcribe-audio-deepgram',
        {
          body: formData,
        }
      )

      if (transcribeError) {
        throw new Error(transcribeError.message || 'Transcription failed')
      }

      if (!result?.transcript) {
        throw new Error(result?.error || 'No transcription generated')
      }

      setTranscriptionProgress(50)
      setTranscription(result.transcript)

      // For now, parse action items from transcript text
      // In a real implementation, you'd call a Claude extraction function
      setTranscriptionProgress(70)
      const extractedItems = parseActionItems(result.transcript)
      setExtractedItems(extractedItems)
      setSelectedItems(new Set(extractedItems.map((_, i) => i)))

      setTranscriptionProgress(100)
      setShowPreview(true)
    } catch (error) {
      setTranscriptionError(error.message || 'Transcription failed')
      console.error('Transcription error:', error)
      setTranscriptionProgress(0)
    } finally {
      setIsTranscribing(false)
    }
  }

  // Simple regex-based action item extraction
  // In production, this would call Claude API for better extraction
  const parseActionItems = (transcript) => {
    const items = []
    const patterns = [
      /(?:action|task|to-do|todo|should|need to|must)[\s:]*([^.!?\n]+[.!?]?)/gi,
      /^[-•]\s*([^.\n]+)/gm,
    ]

    const seen = new Set()
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(transcript)) !== null) {
        const item = match[1]?.trim()
        if (item && !seen.has(item) && item.length > 5) {
          seen.add(item)
          items.push({
            action: item,
            title: item,
          })
        }
      }
    }

    return items.slice(0, 10) // Limit to 10 items
  }

  const handleTranscribe = () => {
    if (audioURL) {
      // Convert blob to file
      fetch(audioURL)
        .then((r) => r.blob())
        .then((blob) => {
          const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' })
          transcribeAudio(file)
        })
    } else if (selectedFile) {
      transcribeAudio(selectedFile)
    }
  }

  const toggleItemSelection = (index) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedItems(newSelected)
  }

  const mergeActionItems = async () => {
    if (!extractedItems || selectedItems.size === 0 || !departmentId) return

    setIsMerging(true)
    try {
      const itemsToMerge = extractedItems
        .filter((_, i) => selectedItems.has(i))
        .map((item) => ({
          title: item.title || item.action || item,
          description: null,
          assigneeId: null,
          dueDate: null,
        }))

      // Create tasks from action items
      await createTasksFromActionItems(meetingId, departmentId, itemsToMerge, profile?.id)

      onActionItemsExtracted?.(itemsToMerge)

      // Reset state
      setShowPreview(false)
      setExtractedItems(null)
      setTranscription(null)
      setAudioURL(null)
      setSelectedFile(null)
      setRecordingTime(0)
    } catch (error) {
      setTranscriptionError(error.message || 'Failed to merge action items')
      console.error('Merge error:', error)
    } finally {
      setIsMerging(false)
    }
  }

  // Show preview modal
  if (showPreview && transcription && extractedItems) {
    return (
      <div style={{ padding: '16px', borderRadius: '8px', background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Extracted Action Items Preview
        </h3>

        {/* Transcription summary */}
        <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface-2)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: '120px', overflowY: 'auto' }}>
          {transcription}
        </div>

        {/* Action items selection */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Select items to add to minutes:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {extractedItems.map((item, idx) => (
              <label
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '10px',
                  background: 'var(--surface-2)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: selectedItems.has(idx) ? '1px solid #4C2A92' : '1px solid var(--border)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedItems.has(idx)}
                  onChange={() => toggleItemSelection(idx)}
                  style={{ marginTop: '2px', cursor: 'pointer' }}
                />
                <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)' }}>
                  {item.title || item.action || item}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={mergeActionItems}
            disabled={isMerging || selectedItems.size === 0}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: selectedItems.size === 0 ? '#ccc' : '#4C2A92',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              cursor: selectedItems.size === 0 ? 'not-allowed' : 'pointer',
              opacity: isMerging ? 0.6 : 1,
            }}
          >
            {isMerging ? '⏳ Merging...' : `Merge ${selectedItems.size} items`}
          </button>
        </div>
      </div>
    )
  }

  // Main panel
  return (
    <div style={{ padding: '16px', borderRadius: '8px', background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
        Audio Transcription
      </h3>

      {/* Error display */}
      {(transcriptionError || fileError) && (
        <div style={{
          padding: '12px',
          marginBottom: '16px',
          background: '#FEE',
          border: '1px solid #DC3545',
          borderRadius: '6px',
          color: '#C33',
          fontSize: '13px',
        }}>
          {transcriptionError || fileError}
          <button
            type="button"
            onClick={() => {
              setTranscriptionError(null)
              setFileError(null)
            }}
            style={{
              marginLeft: '8px',
              padding: '4px 8px',
              background: '#DC3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mode selection */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: canRecord ? '1fr auto 1fr' : '1fr',
        gap: '16px',
        marginBottom: '16px',
        alignItems: 'center',
      }}>
        {/* Upload option */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Upload audio file
          </label>
          <div style={{
            padding: '20px',
            border: '2px dashed #4C2A92',
            borderRadius: '8px',
            background: 'var(--surface-2)',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = '#E8DFF5' }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
          onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {selectedFile ? selectedFile.name : 'Click to upload or drag file'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              MP3, WAV, M4A, WebM • Max 100 MB
            </div>
          </div>
        </div>

        {canRecord && <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>or</div>}

        {/* Live recording option */}
        {canRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Record live
            </label>
            <div style={{
              padding: '20px',
              border: isRecording ? '2px solid #DC2626' : '2px solid #999',
              borderRadius: '8px',
              background: isRecording ? 'rgba(220, 38, 38, 0.05)' : 'var(--surface-2)',
              textAlign: 'center',
            }}>
              {isRecording ? (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#DC2626', marginBottom: '8px' }}>
                    <span style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#DC2626',
                      marginRight: '6px',
                      animation: 'pulse 1s infinite',
                    }} />
                    Recording
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    {formatTime(recordingTime)}
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#DC2626',
                      color: 'white',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Stop recording
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#4C2A92',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🎤 Start recording
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audio preview */}
      {audioURL && (
        <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface-2)', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Audio preview:
          </div>
          <audio
            controls
            src={audioURL}
            style={{ width: '100%', height: '40px' }}
          />
        </div>
      )}

      {/* Transcribe button */}
      {(audioURL || selectedFile) && !isTranscribing && (
        <button
          type="button"
          onClick={handleTranscribe}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '6px',
            border: 'none',
            background: '#4C2A92',
            color: 'white',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '16px',
          }}
        >
          ✨ Transcribe & extract action items
        </button>
      )}

      {/* Progress bar */}
      {isTranscribing && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            height: '6px',
            background: 'var(--surface-2)',
            borderRadius: '3px',
            overflow: 'hidden',
            marginBottom: '8px',
          }}>
            <div style={{
              height: '100%',
              background: '#4C2A92',
              width: `${transcriptionProgress}%`,
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
            {transcriptionProgress < 50 ? 'Transcribing...' : 'Extracting items...'}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
