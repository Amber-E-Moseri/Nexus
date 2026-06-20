import { useState, useEffect } from 'react'
import { Clock, AlertTriangle, RotateCcw, X } from 'lucide-react'
import { getScheduledCampaigns, getFailedCampaigns, retryCampaign, cancelScheduledCampaign } from '..'

const PRIMARY = '#4C2A92'
const ACCENT = '#E8A020'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const SURFACE = '#FFFFFF'
const BORDER = '#EDE8DC'
const SUCCESS = '#2D6A4F'
const ERROR = '#C94830'
const WARNING = '#9A6000'

export default function CampaignStatus({ supabase, isMobile = false }) {
  const [scheduled, setScheduled] = useState([])
  const [failed, setFailed] = useState([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(new Set())

  useEffect(() => {
    loadCampaigns()
    const interval = setInterval(loadCampaigns, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadCampaigns = async () => {
    try {
      const [scheduledData, failedData] = await Promise.all([
        getScheduledCampaigns(supabase),
        getFailedCampaigns(supabase),
      ])
      setScheduled(scheduledData)
      setFailed(failedData)
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async (campaignId) => {
    setRetrying(prev => new Set([...prev, campaignId]))
    try {
      const result = await retryCampaign(supabase, campaignId)
      if (result.success) {
        setFailed(failed.map(c =>
          c.id === campaignId
            ? { ...c, status: 'retrying', retry_count: result.retry_count }
            : c
        ))
      }
    } finally {
      setRetrying(prev => {
        const next = new Set(prev)
        next.delete(campaignId)
        return next
      })
    }
  }

  const handleCancel = async (campaignId) => {
    try {
      const result = await cancelScheduledCampaign(supabase, campaignId)
      if (result.success) {
        setScheduled(scheduled.filter(c => c.id !== campaignId))
      }
    } catch (err) {
      console.error('Failed to cancel campaign:', err)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 20, color: MUTED }}>
        Loading campaign status...
      </div>
    )
  }

  if (scheduled.length === 0 && failed.length === 0) {
    return (
      <div style={{
        background: BG,
        borderRadius: 10,
        padding: 20,
        textAlign: 'center',
        color: MUTED,
      }}>
        No scheduled or failed campaigns
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Scheduled campaigns */}
      {scheduled.length > 0 && (
        <div style={{
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: 16,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}>
            <Clock size={16} style={{ color: '#1A56DB' }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>
              Scheduled Campaigns ({scheduled.length})
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: TEXT }}>Campaign</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: TEXT }}>Scheduled for</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 700, color: TEXT }}>Recipients</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 700, color: TEXT }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map((campaign) => {
                  const scheduledTime = new Date(campaign.scheduled_at)
                  const isInFuture = scheduledTime > new Date()
                  return (
                    <tr key={campaign.id} style={{
                      borderBottom: `1px solid ${BORDER}`,
                    }}>
                      <td style={{ padding: '10px 0', color: TEXT, fontWeight: 600 }}>
                        {campaign.name}
                      </td>
                      <td style={{ padding: '10px 0', color: isInFuture ? TEXT : ERROR }}>
                        {scheduledTime.toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 0', color: MUTED, textAlign: 'right' }}>
                        {campaign.recipient_count ?? 0}
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <button
                          onClick={() => handleCancel(campaign.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            background: 'transparent',
                            border: `1px solid ${ERROR}`,
                            color: ERROR,
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 150ms',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = ERROR
                            e.currentTarget.style.color = '#fff'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = ERROR
                          }}
                        >
                          <X size={11} />
                          Cancel
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Failed campaigns */}
      {failed.length > 0 && (
        <div style={{
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: 16,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}>
            <AlertTriangle size={16} style={{ color: ERROR }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>
              Failed Campaigns ({failed.length})
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: TEXT }}>Campaign</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: TEXT }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: TEXT }}>Retries</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: TEXT }}>Failed/Total</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 700, color: TEXT }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((campaign) => {
                  const isRetrying = campaign.status === 'retrying'
                  const canRetry = campaign.retry_count < 3
                  return (
                    <tr key={campaign.id} style={{
                      borderBottom: `1px solid ${BORDER}`,
                      background: isRetrying ? '#FEF3C7' : 'transparent',
                    }}>
                      <td style={{ padding: '10px 0', color: TEXT, fontWeight: 600 }}>
                        {campaign.name}
                      </td>
                      <td style={{
                        padding: '10px 0',
                        color: isRetrying ? WARNING : ERROR,
                        fontWeight: 700,
                        textTransform: 'capitalize',
                      }}>
                        {campaign.status}
                      </td>
                      <td style={{ padding: '10px 0', color: MUTED }}>
                        {campaign.retry_count || 0}/3
                      </td>
                      <td style={{ padding: '10px 0', color: MUTED }}>
                        {campaign.failed_count ?? 0}/{campaign.recipient_count ?? 0}
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <button
                          onClick={() => handleRetry(campaign.id)}
                          disabled={!canRetry || retrying.has(campaign.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            background: canRetry && !retrying.has(campaign.id) ? 'transparent' : BORDER,
                            border: `1px solid ${canRetry && !retrying.has(campaign.id) ? SUCCESS : BORDER}`,
                            color: canRetry && !retrying.has(campaign.id) ? SUCCESS : MUTED,
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: canRetry && !retrying.has(campaign.id) ? 'pointer' : 'not-allowed',
                            opacity: retrying.has(campaign.id) ? 0.6 : 1,
                            transition: 'all 150ms',
                          }}
                          onMouseEnter={(e) => {
                            if (canRetry && !retrying.has(campaign.id)) {
                              e.currentTarget.style.background = SUCCESS
                              e.currentTarget.style.color = '#fff'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (canRetry && !retrying.has(campaign.id)) {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = SUCCESS
                            }
                          }}
                        >
                          <RotateCcw size={11} />
                          {retrying.has(campaign.id) ? 'Retrying...' : 'Retry'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
