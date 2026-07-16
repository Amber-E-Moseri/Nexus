import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Copy, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { FONT_HEADING } from '../../lib/fonts'

const PRIMARY = 'var(--purple-700)'
const BORDER = 'var(--border-1)'
const TEXT = 'var(--ink-1)'
const MUTED = 'var(--ink-3)'
const BG = 'var(--surface-sub)'
const SUCCESS = 'var(--sage)'
const WARNING = '#92400E'
const ERROR = 'var(--coral-dark)'
const CAMPAIGN_SELECT = 'id, title, status, sent_at'
const RECIPIENT_SELECT = 'id, campaign_id, recipient_name, recipient_email, rsvp_token, status, rsvp_response, rsvp_at, rsvp_notes, sent_at, created_at'

function StatCard({ label, value, percentage, color }) {
  return (
    <div style={{ flex: '1 1 160px', background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: MUTED, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? TEXT }}>{value}</div>
      {percentage ? <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{percentage}</div> : null}
    </div>
  )
}

// Delivery status (pending/sent/bounced/complained) — separate concept from
// RSVP outcome, see RsvpBadge below.
function StatusBadge({ status }) {
  const statusMap = {
    pending:    { bg: 'var(--surface-sub)', color: MUTED },
    sent:       { bg: '#EBF7F1', color: SUCCESS },
    bounced:    { bg: '#FEE2E2', color: ERROR },
    complained: { bg: '#FEE2E2', color: ERROR },
  }
  const s = statusMap[status] ?? statusMap.pending
  return (
    <span style={{ display: 'inline-block', borderRadius: 999, padding: '4px 12px', fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {status}
    </span>
  )
}

// RSVP outcome (pending/yes/no/maybe) — kept as its own field, distinct from
// delivery status, so "opened but no response" isn't conflated with "declined".
function RsvpBadge({ response }) {
  const responseMap = {
    pending: { bg: 'var(--surface-sub)', color: MUTED },
    yes:     { bg: '#D1FAE5', color: '#059669' },
    maybe:   { bg: '#FEF3C7', color: WARNING },
    no:      { bg: '#FEE2E2', color: ERROR },
  }
  const s = responseMap[response] ?? responseMap.pending
  return (
    <span style={{ display: 'inline-block', borderRadius: 999, padding: '4px 12px', fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {response}
    </span>
  )
}

function RecipientDrawer({ recipient, onClose }) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = () => {
    const baseUrl = import.meta.env.VITE_INVITATION_BASE_URL || `${window.location.protocol}//${window.location.host}`
    const inviteUrl = `${baseUrl}/rsvp?token=${recipient.rsvp_token}`
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
            <div style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{recipient.recipient_name || recipient.recipient_email}</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Email</div>
            <div style={{ fontSize: 14, color: TEXT }}>{recipient.recipient_email}</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Delivery Status</div>
            <StatusBadge status={recipient.status} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>RSVP</div>
            <RsvpBadge response={recipient.rsvp_response} />
          </div>
          {recipient.sent_at && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Sent At</div>
              <div style={{ fontSize: 14, color: TEXT }}>{new Date(recipient.sent_at).toLocaleString()}</div>
            </div>
          )}
          {recipient.rsvp_at && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Responded At</div>
              <div style={{ fontSize: 14, color: TEXT }}>{new Date(recipient.rsvp_at).toLocaleString()}</div>
            </div>
          )}
          {recipient.rsvp_notes && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Notes</div>
              <div style={{ fontSize: 14, color: TEXT }}>{recipient.rsvp_notes}</div>
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

// BLW-11: render recipients in windows of 100 — large invite lists (1000+)
// otherwise put every row in the DOM at once.
const RECIPIENT_WINDOW = 100

function RecipientTable({ recipients, onRowClick }) {
  const [visibleCount, setVisibleCount] = useState(RECIPIENT_WINDOW)
  const visible = recipients.slice(0, visibleCount)
  const remaining = recipients.length - visible.length

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Name</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Email</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Status</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Sent At</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
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
              <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 500 }}>{r.recipient_name || r.recipient_email}</td>
              <td style={{ padding: '12px 16px', color: MUTED, fontSize: 13 }}>{r.recipient_email}</td>
              <td style={{ padding: '12px 16px' }}>
                <StatusBadge status={r.status} />
              </td>
              <td style={{ padding: '12px 16px', color: MUTED, fontSize: 13 }}>
                {r.sent_at ? new Date(r.sent_at).toLocaleDateString('en-CA') : '—'}
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
      {remaining > 0 && (
        <div style={{ padding: 14, textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + RECIPIENT_WINDOW)}
            style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, borderRadius: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Show {Math.min(remaining, RECIPIENT_WINDOW)} more ({visible.length} of {recipients.length})
          </button>
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
  const [tab, setTab] = useState('recipients') // recipients | rsvp-guests | analytics
  const [rsvpSummary, setRsvpSummary] = useState(null)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        const [campaignRes, recipientsRes, rsvpRes] = await Promise.all([
          supabase.from('invitation_campaigns').select(CAMPAIGN_SELECT).eq('id', campaignId).single(),
          supabase.from('invitation_recipients').select(RECIPIENT_SELECT).eq('campaign_id', campaignId).order('created_at'),
          supabase.rpc('get_campaign_rsvp_summary', { p_campaign_id: campaignId }).then(r => ({ data: r.data?.[0], error: r.error })),
        ])

        if (campaignRes.error) throw campaignRes.error
        if (recipientsRes.error) throw recipientsRes.error

        setCampaign(campaignRes.data)
        setRecipients(recipientsRes.data ?? [])
        setRsvpSummary(rsvpRes.data || {})
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
      supabase.removeChannel(subscription)
    }
  }, [campaignId])

  const metrics = useMemo(() => {
    const sent = recipients.filter((r) => r.status === 'sent').length
    const bounced = recipients.filter((r) => r.status === 'bounced' || r.status === 'complained').length
    const rsvpYes = recipients.filter((r) => r.rsvp_response === 'yes').length
    const pending = recipients.filter((r) => r.status === 'pending').length
    const total = recipients.length

    return {
      sent,
      bounced,
      rsvpYes,
      pending,
      total,
      sentPct: total > 0 ? Math.round((sent / total) * 100) : 0,
      rsvpYesPct: sent > 0 ? Math.round((rsvpYes / sent) * 100) : 0,
    }
  }, [recipients])

  async function handleResendToPending() {
    const pendingRecipients = recipients.filter((r) => r.status === 'pending')
    if (pendingRecipients.length === 0) {
      setError('No pending recipients to resend to')
      return
    }

    setResending(true)
    try {
      const res = await supabase.functions.invoke('send-invitations', {
        body: { campaignId },
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
          <h1 style={{ fontFamily: FONT_HEADING, fontSize: 28, fontWeight: 800, color: TEXT, margin: 0 }}>{campaign.title}</h1>
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

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, marginBottom: 24, gap: 24 }}>
        <button
          onClick={() => setTab('recipients')}
          style={{
            padding: '12px 0',
            border: 'none',
            background: 'none',
            fontWeight: tab === 'recipients' ? 700 : 500,
            fontSize: 14,
            color: tab === 'recipients' ? PRIMARY : MUTED,
            cursor: 'pointer',
            borderBottom: tab === 'recipients' ? `2px solid ${PRIMARY}` : 'none',
            marginBottom: '-1px',
          }}
        >
          Delivery & Opens
        </button>
        <button
          onClick={() => setTab('rsvp-guests')}
          style={{
            padding: '12px 0',
            border: 'none',
            background: 'none',
            fontWeight: tab === 'rsvp-guests' ? 700 : 500,
            fontSize: 14,
            color: tab === 'rsvp-guests' ? PRIMARY : MUTED,
            cursor: 'pointer',
            borderBottom: tab === 'rsvp-guests' ? `2px solid ${PRIMARY}` : 'none',
            marginBottom: '-1px',
          }}
        >
          RSVP Responses
        </button>
        <button
          onClick={() => setTab('analytics')}
          style={{
            padding: '12px 0',
            border: 'none',
            background: 'none',
            fontWeight: tab === 'analytics' ? 700 : 500,
            fontSize: 14,
            color: tab === 'analytics' ? PRIMARY : MUTED,
            cursor: 'pointer',
            borderBottom: tab === 'analytics' ? `2px solid ${PRIMARY}` : 'none',
            marginBottom: '-1px',
          }}
        >
          Analytics
        </button>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <StatCard label="Sent" value={metrics.sent} percentage={`${metrics.sentPct}% of total`} />
        <StatCard label="RSVP Yes" value={metrics.rsvpYes} percentage={`${metrics.rsvpYesPct}% of sent`} color={SUCCESS} />
        <StatCard label="Bounced" value={metrics.bounced} color={ERROR} />
        <StatCard label="Pending" value={metrics.pending} color={WARNING} />
      </div>

      {/* Resend Button */}
      <div style={{ marginBottom: 32 }}>
        <button
          type="button"
          onClick={handleResendToPending}
          disabled={resending || metrics.pending === 0}
          style={{
            padding: '10px 20px',
            background: metrics.pending === 0 ? MUTED : PRIMARY,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: metrics.pending === 0 ? 'not-allowed' : 'pointer',
            opacity: resending ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {resending ? 'Resending...' : `Resend to ${metrics.pending} Pending`}
        </button>
      </div>

      {/* TAB: Recipients (Delivery & Opens) */}
      {tab === 'recipients' && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 16, margin: '0 0 16px 0' }}>
            Recipients
          </h2>
          <RecipientTable recipients={recipients} onRowClick={setSelectedRecipient} />
        </div>
      )}

      {/* TAB: RSVP Guests */}
      {tab === 'rsvp-guests' && rsvpSummary && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 16, margin: '0 0 16px 0' }}>
            RSVP Responses
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <StatCard label="Total Invited" value={rsvpSummary.total_sent || 0} />
            <StatCard label="Yes (Confirmed)" value={rsvpSummary.rsvp_yes || 0} color={SUCCESS} />
            <StatCard label="Maybe" value={rsvpSummary.rsvp_maybe || 0} color={WARNING} />
            <StatCard label="No (Declined)" value={rsvpSummary.rsvp_no || 0} color={ERROR} />
          </div>
          <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Email</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>RSVP</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Responded</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: TEXT }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {recipients.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: 40, textAlign: 'center', color: MUTED }}>
                      No guests yet
                    </td>
                  </tr>
                ) : (
                  recipients.map((r) => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, background: '#FFFFFF' }}>
                      <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 500 }}>{r.recipient_name || r.recipient_email}</td>
                      <td style={{ padding: '12px 16px', color: MUTED, fontSize: 13 }}>{r.recipient_email}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <RsvpBadge response={r.rsvp_response} />
                      </td>
                      <td style={{ padding: '12px 16px', color: MUTED, fontSize: 13 }}>
                        {r.rsvp_at ? new Date(r.rsvp_at).toLocaleDateString('en-CA') : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: MUTED, fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.rsvp_notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Analytics */}
      {tab === 'analytics' && rsvpSummary && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 16, margin: '0 0 16px 0' }}>
            RSVP Analytics
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Response Rate */}
            <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Response Rate</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1, background: '#F0F0F0', borderRadius: 999, height: 24, overflow: 'hidden' }}>
                  <div
                    style={{
                      background: PRIMARY,
                      height: '100%',
                      width: `${rsvpSummary.response_rate || 0}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: PRIMARY, minWidth: 60 }}>
                  {Math.round(rsvpSummary.response_rate || 0)}%
                </div>
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>
                {rsvpSummary.responded} of {rsvpSummary.total_sent} responded
              </div>
            </div>

            {/* RSVP Breakdown */}
            <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>RSVP Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: SUCCESS }} />
                    <span style={{ fontSize: 13, color: TEXT }}>Yes (Attending)</span>
                  </div>
                  <span style={{ fontWeight: 700, color: SUCCESS }}>{rsvpSummary.rsvp_yes}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: WARNING }} />
                    <span style={{ fontSize: 13, color: TEXT }}>Maybe</span>
                  </div>
                  <span style={{ fontWeight: 700, color: WARNING }}>{rsvpSummary.rsvp_maybe}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ERROR }} />
                    <span style={{ fontSize: 13, color: TEXT }}>No (Declined)</span>
                  </div>
                  <span style={{ fontWeight: 700, color: ERROR }}>{rsvpSummary.rsvp_no}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: MUTED }} />
                    <span style={{ fontSize: 13, color: TEXT }}>Pending</span>
                  </div>
                  <span style={{ fontWeight: 700, color: MUTED }}>{(rsvpSummary.total_sent || 0) - (rsvpSummary.responded || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedRecipient && <RecipientDrawer recipient={selectedRecipient} onClose={() => setSelectedRecipient(null)} />}
    </div>
  )
}
