import { useState, useEffect } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { canProcessTranscript, getTodayStats } from '../../../lib/meetings/costLimits'

export default function TranscriptionUploadPanel({ meetingId, meeting, onProcessComplete }) {
  const { user } = useAuth()
  const [uploadMode, setUploadMode] = useState('transcript') // 'transcript' | 'audio'
  const [transcriptText, setTranscriptText] = useState('')
  const [audioFile, setAudioFile] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [limitError, setLimitError] = useState(null)

  const charCount = transcriptText.length
  const canProcess = (uploadMode === 'transcript' && transcriptText.trim().length > 20) || (uploadMode === 'audio' && audioFile)

  // Load today's stats on mount
  useEffect(() => {
    async function loadStats() {
      if (user?.id) {
        const todayStats = await getTodayStats(user.id)
        setStats(todayStats)
      }
    }
    loadStats()
  }, [user?.id])

  async function handleProcess() {
    if (!canProcess) {
      setError('Please provide a transcript (at least 20 characters) or audio file')
      return
    }

    // Check limits before processing
    const limitCheck = await canProcessTranscript(user.id, charCount)
    if (!limitCheck.allowed) {
      setLimitError(limitCheck.reason)
      return
    }

    if (limitCheck.warnings?.length > 0) {
      console.warn('Processing warnings:', limitCheck.warnings)
    }

    setProcessing(true)
    setError(null)
    setLimitError(null)

    try {
      const textToProcess = transcriptText

      if (!textToProcess.trim()) {
        throw new Error('No transcript to process')
      }

      // Call Edge Function (server-side Claude — keeps the API key off the client)
      const startTime = Date.now()
      const { data, error: fnError } = await supabase.functions.invoke('extract-meeting-data', {
        body: { transcript: textToProcess },
      })

      if (fnError) throw fnError

      const extracted = data?.extracted
      if (!extracted) {
        throw new Error(data?.error || 'Failed to process transcript')
      }

      // Map Edge Function response shape to the structure this view expects
      const normalizedActionItems = (extracted.action_items || []).map((item) => ({
        action: item.title || '',
        owner: item.owner && item.owner !== 'TBD' ? item.owner : null,
        dueDate: item.due_date || null,
        priority: item.priority || 'medium',
      }))

      const resultData = {
        summary: extracted.summary || '',
        keyPoints: extracted.key_topics || [],
        decisions: extracted.decisions || [],
        extractedActionItems: normalizedActionItems,
        processingTimeSeconds: Math.round((Date.now() - startTime) / 1000),
      }

      // Save to database
      const { data: savedTranscription, error: saveError } = await supabase
        .from('meeting_transcriptions')
        .insert([
          {
            meeting_id: meetingId,
            input_type: uploadMode,
            input_file_name: audioFile?.name || 'pasted_transcript',
            input_file_size: audioFile?.size || null,
            summary: resultData.summary,
            key_points: resultData.keyPoints,
            decisions: resultData.decisions,
            extracted_action_items: resultData.extractedActionItems,
            status: 'complete',
            processing_time_seconds: resultData.processingTimeSeconds,
            created_by: user.id,
            processed_at: new Date().toISOString(),
          },
        ])
        .select()
        .single()

      if (saveError) {
        throw new Error(`Failed to save transcription: ${saveError.message}`)
      }

      // Call parent handler with results
      onProcessComplete({
        ...resultData,
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

      {/* Limit Error Message */}
      {limitError && (
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
          🛑 {limitError}
        </div>
      )}

      {/* Processing Error Message */}
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

      {/* Daily Stats */}
      {stats && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            fontSize: 12,
            background: '#F9F8F6',
            border: '1px solid #EDE8DC',
            borderRadius: 6,
            color: '#2D2A22',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 6 }}>📊 Today's Usage</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
            <div>
              ✓ {stats.completedProcesses}/{stats.stats?.maxDailyProcesses || 50} transcriptions
            </div>
            <div>
              💰 ${(stats.totalCost / 100).toFixed(2)}/
              {stats.stats?.maxDailySpend || '$0.50'}
            </div>
          </div>
          {stats.remaining.processes < 10 && (
            <div style={{ marginTop: 6, color: '#DC3545', fontWeight: 500 }}>
              ⚠️ {stats.remaining.processes} transcriptions remaining today
            </div>
          )}
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
