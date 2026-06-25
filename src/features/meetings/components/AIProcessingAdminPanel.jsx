import { useState, useEffect } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { setProcessingEnabled, setDailySpendLimit, setDailyProcessLimit, getLimits } from '../../../lib/meetings/costLimits'

export default function AIProcessingAdminPanel() {
  const { user } = useAuth()
  const [processingEnabled, setProcessingEnabledLocal] = useState(true)
  const [dailySpend, setDailySpend] = useState('0.50')
  const [dailyProcesses, setDailyProcesses] = useState('50')
  const [limits, setLimits] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // Load current limits
  useEffect(() => {
    async function loadLimits() {
      const currentLimits = await getLimits()
      setLimits(currentLimits)
    }
    loadLimits()
  }, [])

  async function handleToggleProcessing() {
    setSaving(true)
    setMessage('')
    try {
      await setProcessingEnabled(!processingEnabled, user.id)
      setProcessingEnabledLocal(!processingEnabled)
      setMessage(
        processingEnabled
          ? '🛑 AI transcription processing is now DISABLED'
          : '✅ AI transcription processing is now ENABLED'
      )
    } catch (err) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateSpendLimit() {
    setSaving(true)
    setMessage('')
    try {
      const amount = parseFloat(dailySpend)
      if (isNaN(amount) || amount < 0.01) {
        throw new Error('Minimum daily limit is $0.01')
      }
      await setDailySpendLimit(amount, user.id)
      setMessage(`✅ Daily spend limit updated to $${amount.toFixed(2)}`)
    } catch (err) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateProcessLimit() {
    setSaving(true)
    setMessage('')
    try {
      const count = parseInt(dailyProcesses)
      if (isNaN(count) || count < 1) {
        throw new Error('Minimum daily limit is 1 process')
      }
      await setDailyProcessLimit(count, user.id)
      setMessage(`✅ Daily process limit updated to ${count}`)
    } catch (err) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #EDE8DC',
        borderRadius: 8,
        padding: 20,
        maxWidth: 600,
      }}
    >
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#2D2A22' }}>
        ⚙️ AI Processing Cost Controls
      </h2>

      {/* Status Message */}
      {message && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            fontSize: 13,
            background: message.includes('Error')
              ? 'rgba(220, 53, 69, 0.1)'
              : 'rgba(76, 42, 146, 0.1)',
            border: message.includes('Error') ? '1px solid #DC3545' : '1px solid #4C2A92',
            borderRadius: 6,
            color: message.includes('Error') ? '#DC3545' : '#4C2A92',
          }}
        >
          {message}
        </div>
      )}

      {/* Processing Enable/Disable */}
      <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #EDE8DC' }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#2D2A22', marginBottom: 8 }}>
            🎯 AI Transcription Processing
          </label>
          <div style={{ fontSize: 12, color: '#9E9488', marginBottom: 12 }}>
            {processingEnabled ? '✅ ENABLED' : '🛑 DISABLED'} — Users can{' '}
            {processingEnabled ? '' : 'NOT '}process transcriptions
          </div>
        </div>
        <button
          onClick={handleToggleProcessing}
          disabled={saving}
          style={{
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            borderRadius: 6,
            background: processingEnabled ? '#DC3545' : '#4C2A92',
            color: '#FFFFFF',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {processingEnabled ? '🛑 DISABLE Processing' : '✅ ENABLE Processing'}
        </button>
      </div>

      {/* Daily Spend Limit */}
      <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #EDE8DC' }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#2D2A22', marginBottom: 8 }}>
          💰 Daily Spending Limit
        </label>
        <div style={{ fontSize: 12, color: '#9E9488', marginBottom: 12 }}>
          Current: ${dailySpend} / day (Haiku: ~$0.0005 per transcript = ~100 transcripts/$0.05)
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="number"
            value={dailySpend}
            onChange={(e) => setDailySpend(e.target.value)}
            step="0.01"
            min="0.01"
            style={{
              flex: 1,
              padding: '10px 12px',
              fontSize: 13,
              border: '1px solid #EDE8DC',
              borderRadius: 6,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleUpdateSpendLimit}
            disabled={saving}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 6,
              background: '#4C2A92',
              color: '#FFFFFF',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            Update
          </button>
        </div>
      </div>

      {/* Daily Process Limit */}
      <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #EDE8DC' }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#2D2A22', marginBottom: 8 }}>
          📊 Daily Process Limit
        </label>
        <div style={{ fontSize: 12, color: '#9E9488', marginBottom: 12 }}>
          Current: {dailyProcesses} transcriptions per day (Rate: max 30 per hour)
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="number"
            value={dailyProcesses}
            onChange={(e) => setDailyProcesses(e.target.value)}
            step="1"
            min="1"
            style={{
              flex: 1,
              padding: '10px 12px',
              fontSize: 13,
              border: '1px solid #EDE8DC',
              borderRadius: 6,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleUpdateProcessLimit}
            disabled={saving}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 6,
              background: '#4C2A92',
              color: '#FFFFFF',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            Update
          </button>
        </div>
      </div>

      {/* Current Limits Info */}
      {limits && (
        <div
          style={{
            padding: 12,
            background: '#F9F8F6',
            border: '1px solid #EDE8DC',
            borderRadius: 6,
            fontSize: 12,
            color: '#2D2A22',
            lineHeight: 1.6,
          }}
        >
          <strong>Current Limits:</strong>
          <div>• Max per transcript: {limits.maxTranscriptChars.toLocaleString()} characters</div>
          <div>• Max per transcript: {limits.maxTokensPerTranscript.toLocaleString()} output tokens</div>
          <div>• Min seconds between processes: {limits.minSecondsBetweenProcesses}s</div>
          <div>• Model: Haiku 3.5 (Fast & Cheap)</div>
          <div>• Pricing: ${limits.costPerThousandTokens} per 1K tokens</div>
        </div>
      )}
    </div>
  )
}
