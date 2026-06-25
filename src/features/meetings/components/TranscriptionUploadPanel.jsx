import { useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { processTranscriptionWithClaude, saveTranscriptionResult } from '../lib/aiProcessing'

export default function TranscriptionUploadPanel({ meetingId, meeting, onProcessComplete }) {
  const { user } = useAuth()
  const [uploadMode, setUploadMode] = useState('transcript') // 'transcript' | 'audio'
  const [transcriptText, setTranscriptText] = useState('')
  const [audioFile, setAudioFile] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  const charCount = transcriptText.length
  const canProcess = (uploadMode === 'transcript' && transcriptText.trim().length > 20) || (uploadMode === 'audio' && audioFile)

  async function handleProcess() {
    if (!canProcess) {
      setError('Please provide a transcript (at least 20 characters) or audio file')
      return
    }

    setProcessing(true)
    setError(null)

    try {
      const textToProcess = transcriptText

      if (!textToProcess.trim()) {
        throw new Error('No transcript to process')
      }

      // Call Claude API
      const result = await processTranscriptionWithClaude(textToProcess, {
        meetingType: meeting.meeting_type?.replace(/_/g, ' ') || 'Meeting',
        date: meeting.date,
        moderator: meeting.moderator,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to process transcript')
      }

      // Save to database
      const savedTranscription = await saveTranscriptionResult(
        meetingId,
        {
          inputType: uploadMode,
          fileName: audioFile?.name || 'pasted_transcript',
          fileSize: audioFile?.size || null,
          ...result.data,
        },
        user.id
      )

      // Call parent handler with results
      onProcessComplete({
        ...result.data,
        transcriptionId: savedTranscription.id,
      })

      // Clear form
      setTranscriptText('')
      setAudioFile(null)
    } catch (err) {
      console.error('Processing error:', err)
      setError(err.message || 'Failed to process transcript. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #EDE8DC',
        borderRadius: 8,
        padding: 20,
        marginTop: 20,
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#2D2A22' }}>
        ✨ Process Meeting Transcript
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9E9488' }}>
        Let AI extract decisions, action items, and summary from your notes
      </p>

      {/* Upload Mode Selector */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => setUploadMode('transcript')}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 500,
            border: uploadMode === 'transcript' ? '2px solid #4C2A92' : '1px solid #EDE8DC',
            borderRadius: 6,
            background: uploadMode === 'transcript' ? '#F4F1EA' : '#FFFFFF',
            color: uploadMode === 'transcript' ? '#4C2A92' : '#2D2A22',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          📄 Paste Transcript
        </button>
        <button
          onClick={() => setUploadMode('audio')}
          disabled
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 500,
            border: '1px solid #EDE8DC',
            borderRadius: 6,
            background: '#FFFFFF',
            color: '#9E9488',
            cursor: 'not-allowed',
            opacity: 0.5,
          }}
        >
          🎙️ Audio (Soon)
        </button>
      </div>

      {/* Transcript Input */}
      {uploadMode === 'transcript' && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500, color: '#2D2A22' }}>
            Paste meeting transcript or notes:
          </label>
          <textarea
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Paste Zoom transcript, notes, or any meeting documentation..."
            rows={8}
            disabled={processing}
            style={{
              width: '100%',
              padding: 12,
              fontSize: 13,
              border: '1px solid #EDE8DC',
              borderRadius: 6,
              fontFamily: 'inherit',
              resize: 'vertical',
              opacity: processing ? 0.6 : 1,
              cursor: processing ? 'not-allowed' : 'auto',
            }}
          />
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: charCount < 20 ? '#9E9488' : '#4C2A92',
            }}
          >
            {charCount} characters {charCount < 20 && '(min 20 required)'}
          </div>
        </div>
      )}

      {/* Audio Upload */}
      {uploadMode === 'audio' && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500, color: '#2D2A22' }}>
            Select audio file:
          </label>
          <input
            type="file"
            accept=".mp3,.wav,.m4a,.aac"
            onChange={(e) => setAudioFile(e.target.files?.[0])}
            disabled={processing}
            style={{
              display: 'block',
              marginBottom: 8,
              opacity: processing ? 0.6 : 1,
            }}
          />
          {audioFile && (
            <div style={{ fontSize: 13, color: '#4C2A92', fontWeight: 500 }}>
              📁 {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(1)} MB)
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            fontSize: 13,
            background: 'rgba(220, 53, 69, 0.1)',
            border: '1px solid #DC3545',
            borderRadius: 6,
            color: '#DC3545',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Process Button */}
      <button
        onClick={handleProcess}
        disabled={processing || !canProcess}
        style={{
          width: '100%',
          padding: '12px 16px',
          fontSize: 13,
          fontWeight: 600,
          border: 'none',
          borderRadius: 6,
          background: '#4C2A92',
          color: '#FFFFFF',
          cursor: processing || !canProcess ? 'not-allowed' : 'pointer',
          opacity: processing || !canProcess ? 0.6 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {processing ? '🔄 Processing (10-30 seconds)...' : '✨ Process with AI'}
      </button>

      {/* Help text */}
      <p style={{ marginTop: 12, fontSize: 12, color: '#9E9488', margin: 0 }}>
        🔐 Your transcript is sent to Claude API for processing and not stored.
        <br />
        Results are saved to your meeting for review.
      </p>
    </div>
  )
}
