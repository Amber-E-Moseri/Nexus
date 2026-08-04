import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { Send, Mail, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

const PRIMARY = '#4C2A92'
const BORDER  = '#EDE8DC'
const TEXT    = '#2D2A22'
const MUTED   = '#9E9488'
const BG      = '#FAFAF8'
const GREEN   = '#2e7d32'
const RED     = '#c62828'
const AMBER   = '#e65100'

const TYPE_LABELS = {
  weekly_digest: 'Weekly Digest',
  dormant_nudge: 'Dormant Nudge',
  feature_announcement: 'Feature Announcement',
  absence_email: 'Absence Email',
}

function StatusBadge({ status }) {
  const color = status === 'sent' ? GREEN : status === 'failed' ? RED : AMBER
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, color, background: color + '18',
    }}>
      {status}
    </span>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: '16px 20px', flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: TEXT }}>{value}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function EmailAdminPage() {
  const { profile } = useAuth()
  const toast = useToast()

  // Announcement form
  const [form, setForm] = useState({
    feature_name: '',
    tagline: '',
    description: '',
    benefits: '',
    cta_label: 'Try it now',
    cta_url: '',
  })
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)

  // Delivery log
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0 })
  const [logsLoading, setLogsLoading] = useState(true)
  const [logFilter, setLogFilter] = useState('all')
  const [showFullLog, setShowFullLog] = useState(false)

  const isAdmin = profile?.role === 'super_admin'

  useEffect(() => {
    if (!isAdmin) return
    loadLogs()
  }, [isAdmin, logFilter])

  async function loadLogs() {
    setLogsLoading(true)
    let q = supabase
      .from('email_delivery_log')
      .select('id, recipient_email, subject, email_type, status, http_status, sent_at, error_message')
      .in('email_type', ['weekly_digest', 'dormant_nudge', 'feature_announcement'])
      .order('sent_at', { ascending: false })
      .limit(showFullLog ? 200 : 50)

    if (logFilter !== 'all') q = q.eq('email_type', logFilter)

    const { data, error } = await q
    if (error) { console.error(error); setLogsLoading(false); return }

    setLogs(data ?? [])

    // Stats (unfiltered totals)
    const { data: allRows } = await supabase
      .from('email_delivery_log')
      .select('status')
      .in('email_type', ['weekly_digest', 'dormant_nudge', 'feature_announcement'])

    const rows = allRows ?? []
    setStats({
      total: rows.length,
      sent: rows.filter(r => r.status === 'sent').length,
      failed: rows.filter(r => r.status === 'failed').length,
    })
    setLogsLoading(false)
  }

  async function handleSendAnnouncement(e) {
    e.preventDefault()
    if (!form.feature_name || !form.description || !form.cta_url || !form.cta_label) {
      toast?.error('Fill in all required fields')
      return
    }
    setSending(true)
    setSendResult(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const benefits = form.benefits
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feature-announcement-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            feature_name: form.feature_name,
            tagline: form.tagline || undefined,
            description: form.description,
            benefits,
            cta_label: form.cta_label,
            cta_url: form.cta_url,
          }),
        },
      )

      const result = await res.json()
      setSendResult({ ok: res.ok, ...result })
      if (res.ok) {
        toast?.success(`Sent to ${result.sent} users`)
        setForm(f => ({ ...f, feature_name: '', tagline: '', description: '', benefits: '' }))
        loadLogs()
      } else {
        toast?.error(result.error ?? 'Send failed')
      }
    } catch (err) {
      setSendResult({ ok: false, error: err.message })
      toast?.error(err.message)
    } finally {
      setSending(false)
    }
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, color: TEXT, textAlign: 'center' }}>
        <p style={{ color: MUTED }}>Super admin only.</p>
      </div>
    )
  }

  const successRate = stats.total > 0
    ? Math.round((stats.sent / stats.total) * 100)
    : null

  return (
    <div style={{ minHeight: '100vh', background: BG }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '20px 28px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 2px', color: TEXT }}>
          Email Management
        </h1>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
          Send feature announcements and monitor automated email delivery.
        </p>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="Total sent" value={stats.total} />
          <StatCard label="Delivered" value={stats.sent} sub={successRate != null ? `${successRate}% success rate` : undefined} />
          <StatCard label="Failed" value={stats.failed} />
        </div>

        {/* Send Announcement */}
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Mail size={16} color={PRIMARY} />
            <span style={{ fontWeight: 600, fontSize: 15, color: TEXT }}>Send Feature Announcement</span>
          </div>

          <form onSubmit={handleSendAnnouncement} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Feature name *</label>
                <input
                  value={form.feature_name}
                  onChange={e => setForm(f => ({ ...f, feature_name: e.target.value }))}
                  placeholder="e.g. Sprint Task Board"
                  style={inputStyle}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Tagline</label>
                <input
                  value={form.tagline}
                  onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                  placeholder="One-line hook (optional)"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Description *</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="1-2 sentences explaining what the feature does"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Benefits (one per line, optional)</label>
              <textarea
                value={form.benefits}
                onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))}
                placeholder={'Drag tasks to update status\nSee due dates at a glance\nCollaborate in real time'}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Button label *</label>
                <input
                  value={form.cta_label}
                  onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))}
                  placeholder="Try it now"
                  style={inputStyle}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Button URL *</label>
                <input
                  value={form.cta_url}
                  onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))}
                  placeholder="/sprints"
                  style={inputStyle}
                  required
                />
              </div>
            </div>

            {sendResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 13,
                background: sendResult.ok ? '#e8f5e9' : '#fce4ec',
                color: sendResult.ok ? GREEN : RED,
              }}>
                {sendResult.ok
                  ? `Sent to ${sendResult.sent} user${sendResult.sent !== 1 ? 's' : ''}.${sendResult.skipped ? ` ${sendResult.skipped} skipped (opted out).` : ''}`
                  : `Error: ${sendResult.error ?? 'Unknown error'}`
                }
                {sendResult.errors?.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                    {sendResult.errors.join(', ')}
                  </div>
                )}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={sending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', background: sending ? MUTED : PRIMARY,
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                }}
              >
                <Send size={14} />
                {sending ? 'Sending…' : 'Send to all users'}
              </button>
              <span style={{ marginLeft: 12, fontSize: 12, color: MUTED }}>
                Skips users who opted out of announcements
              </span>
            </div>
          </form>
        </div>

        {/* Delivery Log */}
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 20px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: TEXT, flex: 1 }}>Delivery Log</span>
            <select
              value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
              style={{
                padding: '5px 10px', border: `1px solid ${BORDER}`, borderRadius: 6,
                fontSize: 12, color: TEXT, background: '#fff', cursor: 'pointer',
              }}
            >
              <option value="all">All types</option>
              <option value="weekly_digest">Weekly Digest</option>
              <option value="dormant_nudge">Dormant Nudge</option>
              <option value="feature_announcement">Feature Announcement</option>
            </select>
            <button
              onClick={loadLogs}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
                border: `1px solid ${BORDER}`, borderRadius: 6, background: '#fff',
                fontSize: 12, color: MUTED, cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>

          {logsLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: MUTED, fontSize: 13 }}>
              Loading…
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: MUTED, fontSize: 13 }}>
              No emails logged yet.
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: BG }}>
                      {['Recipient', 'Type', 'Subject', 'Status', 'Sent at'].map(h => (
                        <th key={h} style={{
                          padding: '8px 14px', textAlign: 'left', color: MUTED,
                          fontWeight: 600, fontSize: 11, letterSpacing: '0.04em',
                          borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(row => (
                      <tr
                        key={row.id}
                        style={{ borderBottom: `1px solid ${BORDER}` }}
                        title={row.error_message ?? ''}
                      >
                        <td style={{ padding: '8px 14px', color: TEXT }}>{row.recipient_email}</td>
                        <td style={{ padding: '8px 14px', color: MUTED }}>
                          {TYPE_LABELS[row.email_type] ?? row.email_type}
                        </td>
                        <td style={{ padding: '8px 14px', color: MUTED, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.subject}
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <StatusBadge status={row.status} />
                        </td>
                        <td style={{ padding: '8px 14px', color: MUTED, whiteSpace: 'nowrap' }}>
                          {row.sent_at
                            ? new Date(row.sent_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                onClick={() => setShowFullLog(v => !v)}
                style={{
                  padding: '10px 20px', borderTop: `1px solid ${BORDER}`,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  fontSize: 12, color: MUTED,
                }}
              >
                {showFullLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {showFullLog ? 'Show fewer' : 'Show more'}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: MUTED,
  marginBottom: 5, letterSpacing: '0.03em',
}

const inputStyle = {
  width: '100%', padding: '8px 12px', fontSize: 13,
  border: `1px solid ${BORDER}`, borderRadius: 8,
  color: TEXT, background: '#fff', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
}
