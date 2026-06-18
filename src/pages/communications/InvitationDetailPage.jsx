import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Copy, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const SUCCESS = '#2D6A4F'
const WARNING = '#92400E'
const ERROR = '#C94830'

function StatCard({ label, value, percentage, color }) {
  return (
    <div style={{ flex: '1 1 160px', background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: MUTED, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? TEXT }}>{value}</div>
      {percentage ? <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{percentage}</div> : null}
    </div>
  )
}

function StatusBadge({ status }) {
  const statusMap = {
    pending:  { bg: '#F4F1EA', color: MUTED },
    sent:     { bg: '#EBF7F1', color: SUCCESS },
    opened:   { bg: '#E8EEFA', color: '#1A56DB' },
    rsvp_yes: { bg: '#D1FAE5', color: '#059669' },
    rsvp_no:  { bg: '#FEE2E2', color: ERROR },
  }
  const s = statusMap[status] ?? statusMap.pending
  return (
    <span style={{ display: 'inline-block', borderRadius: 999, padding: '4px 12px', fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {status.replace('_', ' ')}
    </span>
  )
}

function RecipientDrawer({ recipient, onClose }) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = () => {
    const baseUrl = import.meta.env.VITE_INVITATION_BASE_URL || `${window.location.protocol}//${window.location.host}`
    const inviteUrl = `${baseUrl}/i/${recipient.token}`
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', background: 'rgba(14,14,30,0.45)' }}>
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
      <div style={{ position: 'relative', zIndex: 51, marginLeft: 'auto', width: '100%', maxWidth: 400, background: '#FFFFFF', boxShadow: '-24px 0 64px rgba(14,14,30,0.22)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Details</div>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
            Close
          </button>
        </div>
        <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Name</div>
            <div style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{recipient.full_name || recipient.email}</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Email</div>
            <div style={{ fontSize: 14, color: TEXT }}>{recipient.email}</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Status</div>
            <StatusBadge status={recipient.status} />
          </div>
          {recipient.sent_at && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Sent At</div>
              <div style={{ fontSize: 14, color: TEXT }}>{new Date(recipient.sent_at).toLocaleString()}</div>
            </div>
          )}
          {recipient.opened_at && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Opened At</div>
              <div style={{ fontSize: 14, color: TEXT }}>{new Date(recipient.opened_at).toLocaleString()}</div>
            </div>
          )}
          {recipient.rsvp_at && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>RSVP Response</div>
              <div style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{recipient.status === 'rsvp_yes' ? 'Attending' : 'Declining'}</div>
            </div>
          )}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Invitation Link</div>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                fontSize: 12,
                cursor: 'pointer',
                color: TEXT,
                fontWeight: 500,
              }}
            >
              <span style={{ wordBreak: 'break-all', textAlign: 'left' }}>Copy Link</span>
              {copied ? <CheckCircle size={16} color={SUCCESS} /> : <Copy size={16} color={MUTED} />}
            </button>
            {copied && <div style={{ fontSize: 11, color: SUCCESS, marginTop: 6, fontWeight: 600 }}>Copied!</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function RecipientTable({ recipients, onRowClick }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Name</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Email</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Status</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Sent At</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Opened At</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r) => (
            <tr
              key={r.id}
              onClick={() => onRowClick(r)}
              style={{
                borderBottom: `1px solid ${BORDER}`,
                cursor: 'pointer',
                background: '#FFFFFF',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = BG)}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
            >
              <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 500 }}>{r.full_name || r.email}</td>
              <td style={{ padding: '12px 16px', color: MUTED, fontSize: 13 }}>{r.email}</td>
              <td style={{ padding: '12px 16px' }}>
                <StatusBadge status={r.status} />
              </td>
              <td style={{ padding: '12px 16px', color: MUTED, fontSize: 13 }}>
                {r.sent_at ? new Date(r.sent_at).toLocaleDateString('en-CA') : '—'}
              </td>
              <td style={{ padding: '12px 16px', color: MUTED, fontSize: 13 }}>
                {r.opened_at ? new Date(r.opened_at).toLocaleDateString('en-CA') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {recipients.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>
          No recipients yet
        </div>
      )}
    </div>
  )
}

export default function InvitationDetailPage() {
  const { id: campaignId } = useParams()
  const [campaign, setCampaign] = useState(null)
  const [recipients, setRecipients] = useState([])
  const [selectedRecipient, setSelectedRecipient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        const [campaignRes, recipientsRes] = await Promise.all([
          supabase.from('invitation_campaigns').select('*').eq('id', campaignId).single(),
          supabase.from('invitation_recipients').select('*').eq('campaign_id', campaignId).order('created_at'),
        ])

        if (campaignRes.error) throw campaignRes.error
        if (recipientsRes.error) throw recipientsRes.error

        setCampaign(campaignRes.data)
        setRecipients(recipientsRes.data ?? [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()

    // Real-time subscription
    const subscription = supabase
      .channel(`campaign:${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitation_recipients', filter: `campaign_id=eq.${campaignId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setRecipients((prev) => [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setRecipients((prev) => prev.map((r) => (r.id === payload.new.id ? payload.new : r)))
        } else if (payload.eventType === 'DELETE') {
          setRecipients((prev) => prev.filter((r) => r.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [campaignId])

  const metrics = useMemo(() => {
    const sent = recipients.filter((r) => r.status !== 'pending').length
    const opened = recipients.filter((r) => r.opened_at).length
    const rsvpYes = recipients.filter((r) => r.status === 'rsvp_yes').length
    const unopened = recipients.filter((r) => r.sent_at && !r.opened_at).length
    const total = recipients.length

    return {
      sent,
      opened,
      rsvpYes,
      unopened,
      total,
      sentPct: total > 0 ? Math.round((sent / total) * 100) : 0,
      openedPct: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      rsvpYesPct: opened > 0 ? Math.round((rsvpYes / opened) * 100) : 0,
    }
  }, [recipients])

  async function handleResendToUnopened() {
    const unopenedRecipients = recipients.filter((r) => r.status === 'sent' && !r.opened_at)
    if (unopenedRecipients.length === 0) {
      setError('No unopened recipients to resend to')
      return
    }

    setResending(true)
    try {
      const res = await supabase.functions.invoke('send-invitations', {
        body: { campaign_id: campaignId, filter_unopened: true },
      })
      if (res.error) throw res.error
      setError(null)
      // Success message shown via toast in real app
    } catch (err) {
      setError(err.message)
    } finally {
      setResending(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>
        <div style={{ animation: 'pulse 1.5s ease-in-out infinite', display: 'inline-block' }}>Loading...</div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: ERROR }}>
        Campaign not found
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: TEXT, margin: 0 }}>{campaign.name}</h1>
          <span style={{ display: 'inline-block', borderRadius: 999, padding: '4px 12px', fontSize: 11, fontWeight: 700, background: '#EBF7F1', color: SUCCESS }}>
            {campaign.status.toUpperCase()}
          </span>
        </div>
        {campaign.sent_at && (
          <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>
            Sent {new Date(campaign.sent_at).toLocaleDateString('en-CA')}
          </p>
        )}
      </div>

      {error && (
        <div style={{ background: '#FEF0ED', border: `1px solid ${ERROR}`, borderRadius: 8, padding: 12, marginBottom: 20, color: ERROR, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <StatCard label="Sent" value={metrics.sent} percentage={`${metrics.sentPct}% of total`} />
        <StatCard label="Opened" value={metrics.opened} percentage={`${metrics.openedPct}% of sent`} color="#1A56DB" />
        <StatCard label="RSVP Yes" value={metrics.rsvpYes} percentage={`${metrics.rsvpYesPct}% of opened`} color={SUCCESS} />
        <StatCard label="Unopened" value={metrics.unopened} color={WARNING} />
      </div>

      {/* Resend Button */}
      <div style={{ marginBottom: 32 }}>
        <button
          type="button"
          onClick={handleResendToUnopened}
          disabled={resending || metrics.unopened === 0}
          style={{
            padding: '10px 20px',
            background: metrics.unopened === 0 ? MUTED : PRIMARY,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: metrics.unopened === 0 ? 'not-allowed' : 'pointer',
            opacity: resending ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {resending ? 'Resending...' : `Resend to ${metrics.unopened} Unopened`}
        </button>
      </div>

      {/* Recipients Table */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 16, margin: '0 0 16px 0' }}>
          Recipients
        </h2>
        <RecipientTable recipients={recipients} onRowClick={setSelectedRecipient} />
      </div>

      {selectedRecipient && <RecipientDrawer recipient={selectedRecipient} onClose={() => setSelectedRecipient(null)} />}
    </div>
  )
}
