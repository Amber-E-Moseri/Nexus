import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { Send, Mail, RefreshCw, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'

const PRIMARY = '#4C2A92'
const BORDER  = '#EDE8DC'
const TEXT    = '#2D2A22'
const MUTED   = '#9E9488'
const BG      = '#FAFAF8'
const GREEN   = '#2e7d32'
const RED     = '#c62828'

const TYPE_LABELS = {
  weekly_digest: 'Weekly Digest',
  dormant_nudge: 'Dormant Nudge',
  feature_announcement: 'Feature Announcement',
  absence_email: 'Absence Email',
}

const ROLES = [
  { value: 'super_admin',       label: 'Super Admin' },
  { value: 'regional_secretary',label: 'Regional Secretary' },
  { value: 'dept_lead',         label: 'Dept Lead' },
  { value: 'pastor',            label: 'Pastor' },
  { value: 'ors',               label: 'ORS' },
  { value: 'member',            label: 'Member' },
]

function StatusBadge({ status }) {
  const color = status === 'sent' ? GREEN : status === 'failed' ? RED : MUTED
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

function buildPreviewHtml(form, frontendUrl = 'https://nexus.lwcanada.org') {
  const year = new Date().getFullYear()
  const benefits = form.benefits
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 3)

  const benefitRows = benefits.map(b => `
    <li style="margin:0;padding:8px 0;border-bottom:1px solid #f4f0e8;font-size:13px;color:#2d2a22;list-style:none;display:flex;align-items:flex-start;gap:10px;">
      <span style="width:6px;height:6px;border-radius:50%;background:#4c2a92;flex-shrink:0;margin-top:5px;"></span>
      <span>${b}</span>
    </li>`).join('')

  const ctaUrl = (form.cta_url || '/').startsWith('http')
    ? form.cta_url
    : `${frontendUrl}${form.cta_url || '/'}`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:#4c2a92;padding:24px 28px;">
    <p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.6);">Nexus</p>
    <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:99px;padding:4px 12px;margin-bottom:14px;">
      <span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.06em;text-transform:uppercase;">What's New</span>
    </div>
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#fff;line-height:1.2;">${form.feature_name || 'Feature Name'}</h1>
    <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.8);">${form.tagline || ''}</p>
  </div>
  <div style="padding:28px 28px 0;">
    <p style="margin:0 0 20px;font-size:15px;color:#2d2a22;">Hi <strong>there</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#5a5248;line-height:1.7;">${form.description || 'Description goes here.'}</p>
    ${benefits.length > 0 ? `
    <div style="margin-bottom:24px;background:#faf8f5;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;">
      <ul style="margin:0;padding:12px 16px;">${benefitRows}</ul>
    </div>` : ''}
  </div>
  <div style="padding:8px 28px 28px;text-align:center;">
    <a href="${ctaUrl}" style="display:inline-block;padding:14px 36px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">${form.cta_label || 'Get started'}</a>
  </div>
  <div style="background:#f9f7f5;border-top:1px solid #e8dedd;padding:16px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9e9488;">
      You're receiving this as an active Nexus user.
      &nbsp;·&nbsp;
      <a href="${frontendUrl}/settings" style="color:#4c2a92;text-decoration:none;font-weight:500;">Unsubscribe from announcements</a>
      &nbsp;·&nbsp; © ${year} Nexus
    </p>
  </div>
</div>
</body>
</html>`
}

export default function EmailAdminPage() {
  const { profile } = useAuth()
  const toast = useToast()

  const [form, setForm] = useState({
    feature_name: '',
    tagline: '',
    description: '',
    benefits: '',
    cta_label: 'Go to Dashboard',
    cta_url: 'https://nexus.lwcanada.org',
  })

  // Audience targeting
  const [audienceMode, setAudienceMode] = useState('all') // 'all' | 'department' | 'role'
  const [selectedDepts, setSelectedDepts] = useState([])
  const [selectedRoles, setSelectedRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [recipientCount, setRecipientCount] = useState(null)
  const [countLoading, setCountLoading] = useState(false)

  // Preview
  const [showPreview, setShowPreview] = useState(false)
  const iframeRef = useRef(null)

  // Send state
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
    loadDepartments()
    loadLogs()
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    loadLogs()
  }, [logFilter, showFullLog])

  useEffect(() => {
    if (!isAdmin) return
    estimateRecipients()
  }, [audienceMode, selectedDepts, selectedRoles, isAdmin])

  // Update iframe preview when form changes
  useEffect(() => {
    if (showPreview && iframeRef.current) {
      iframeRef.current.srcdoc = buildPreviewHtml(form)
    }
  }, [form, showPreview])

  async function loadDepartments() {
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .order('name')
    setDepartments(data ?? [])
  }

  async function estimateRecipients() {
    setCountLoading(true)
    let q = supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .not('email', 'is', null)

    if (audienceMode === 'department' && selectedDepts.length > 0) {
      q = q.in('department_id', selectedDepts)
    } else if (audienceMode === 'role' && selectedRoles.length > 0) {
      q = q.in('role', selectedRoles)
    }

    const { count } = await q
    setRecipientCount(count ?? 0)
    setCountLoading(false)
  }

  async function loadLogs() {
    setLogsLoading(true)
    let q = supabase
      .from('email_delivery_log')
      .select('id, recipient_email, subject, email_type, status, sent_at, error_message')
      .in('email_type', ['weekly_digest', 'dormant_nudge', 'feature_announcement'])
      .order('sent_at', { ascending: false })
      .limit(showFullLog ? 200 : 50)

    if (logFilter !== 'all') q = q.eq('email_type', logFilter)

    const { data } = await q
    setLogs(data ?? [])

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

  function toggleDept(id) {
    setSelectedDepts(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    )
  }

  function toggleRole(value) {
    setSelectedRoles(prev =>
      prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value]
    )
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!form.feature_name || !form.description || !form.cta_url || !form.cta_label) {
      toast?.error('Fill in all required fields')
      return
    }
    if (audienceMode === 'department' && selectedDepts.length === 0) {
      toast?.error('Select at least one department')
      return
    }
    if (audienceMode === 'role' && selectedRoles.length === 0) {
      toast?.error('Select at least one role')
      return
    }

    setSending(true)
    setSendResult(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const benefits = form.benefits.split('\n').map(l => l.trim()).filter(Boolean)

      const payload = {
        feature_name: form.feature_name,
        tagline: form.tagline || undefined,
        description: form.description,
        benefits,
        cta_label: form.cta_label,
        cta_url: form.cta_url,
      }
      if (audienceMode === 'department' && selectedDepts.length > 0) {
        payload.department_ids = selectedDepts
      } else if (audienceMode === 'role' && selectedRoles.length > 0) {
        payload.roles = selectedRoles
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feature-announcement-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
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
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '20px 28px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 2px', color: TEXT }}>Email Management</h1>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
          Send feature announcements and monitor automated email delivery.
        </p>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="Total sent" value={stats.total} />
          <StatCard label="Delivered" value={stats.sent} sub={successRate != null ? `${successRate}% success rate` : undefined} />
          <StatCard label="Failed" value={stats.failed} />
        </div>

        {/* Send Announcement */}
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mail size={16} color={PRIMARY} />
            <span style={{ fontWeight: 600, fontSize: 15, color: TEXT }}>Send Feature Announcement</span>
          </div>

          <form onSubmit={handleSend} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Audience targeting */}
            <div>
              <label style={labelStyle}>Audience</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {[
                  { id: 'all', label: 'All active users' },
                  { id: 'department', label: 'By department' },
                  { id: 'role', label: 'By role' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAudienceMode(opt.id)}
                    style={{
                      padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${audienceMode === opt.id ? PRIMARY : BORDER}`,
                      background: audienceMode === opt.id ? PRIMARY + '12' : '#fff',
                      color: audienceMode === opt.id ? PRIMARY : MUTED,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {audienceMode === 'department' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {departments.map(dept => (
                    <label key={dept.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                      border: `1.5px solid ${selectedDepts.includes(dept.id) ? PRIMARY : BORDER}`,
                      borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                      background: selectedDepts.includes(dept.id) ? PRIMARY + '10' : '#fff',
                      color: selectedDepts.includes(dept.id) ? PRIMARY : TEXT,
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedDepts.includes(dept.id)}
                        onChange={() => toggleDept(dept.id)}
                        style={{ margin: 0 }}
                      />
                      {dept.name}
                    </label>
                  ))}
                </div>
              )}

              {audienceMode === 'role' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ROLES.map(r => (
                    <label key={r.value} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                      border: `1.5px solid ${selectedRoles.includes(r.value) ? PRIMARY : BORDER}`,
                      borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                      background: selectedRoles.includes(r.value) ? PRIMARY + '10' : '#fff',
                      color: selectedRoles.includes(r.value) ? PRIMARY : TEXT,
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(r.value)}
                        onChange={() => toggleRole(r.value)}
                        style={{ margin: 0 }}
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              )}

              {recipientCount !== null && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>
                  {countLoading ? 'Estimating…' : `~${recipientCount} potential recipient${recipientCount !== 1 ? 's' : ''} (before opt-out check)`}
                </p>
              )}
            </div>

            {/* Form fields */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Feature name *</label>
                <input value={form.feature_name} onChange={e => setForm(f => ({ ...f, feature_name: e.target.value }))}
                  placeholder="e.g. Sprint Task Board" style={inputStyle} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Tagline</label>
                <input value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                  placeholder="One-line hook (optional)" style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Description *</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="1-2 sentences explaining the feature" rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} required />
            </div>

            <div>
              <label style={labelStyle}>Benefits (one per line, optional)</label>
              <textarea value={form.benefits} onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))}
                placeholder={'Drag tasks to update status\nSee due dates at a glance'} rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Button label *</label>
                <input value={form.cta_label} onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))}
                  placeholder="Try it now" style={inputStyle} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Button URL *</label>
                <input value={form.cta_url} onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))}
                  placeholder="/sprints" style={inputStyle} required />
              </div>
            </div>

            {/* Preview toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowPreview(v => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', border: `1px solid ${BORDER}`, borderRadius: 8,
                  background: '#fff', fontSize: 12, color: MUTED, cursor: 'pointer',
                }}
              >
                {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                {showPreview ? 'Hide preview' : 'Preview email'}
              </button>
            </div>

            {showPreview && (
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', background: '#f5f5f5' }}>
                <div style={{ padding: '8px 14px', borderBottom: `1px solid ${BORDER}`, background: '#fff', fontSize: 11, color: MUTED }}>
                  Preview — <strong style={{ color: TEXT }}>New in Nexus: {form.feature_name || 'Feature Name'}</strong>
                </div>
                <iframe
                  ref={iframeRef}
                  srcDoc={buildPreviewHtml(form)}
                  style={{ width: '100%', height: 520, border: 'none', display: 'block' }}
                  sandbox="allow-same-origin"
                  title="Email preview"
                />
              </div>
            )}

            {sendResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 13,
                background: sendResult.ok ? '#e8f5e9' : '#fce4ec',
                color: sendResult.ok ? GREEN : RED,
              }}>
                {sendResult.ok
                  ? `Sent to ${sendResult.sent} user${sendResult.sent !== 1 ? 's' : ''}.${sendResult.skipped ? ` ${sendResult.skipped} skipped (opted out).` : ''}`
                  : `Error: ${sendResult.error ?? 'Unknown error'}`}
                {sendResult.errors?.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>{sendResult.errors.join(', ')}</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                {sending ? 'Sending…' : 'Send announcement'}
              </button>
              <span style={{ fontSize: 12, color: MUTED }}>Skips users who opted out</span>
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
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {logsLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: MUTED, fontSize: 13 }}>No emails logged yet.</div>
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
                      <tr key={row.id} style={{ borderBottom: `1px solid ${BORDER}` }} title={row.error_message ?? ''}>
                        <td style={{ padding: '8px 14px', color: TEXT }}>{row.recipient_email}</td>
                        <td style={{ padding: '8px 14px', color: MUTED }}>{TYPE_LABELS[row.email_type] ?? row.email_type}</td>
                        <td style={{ padding: '8px 14px', color: MUTED, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.subject}
                        </td>
                        <td style={{ padding: '8px 14px' }}><StatusBadge status={row.status} /></td>
                        <td style={{ padding: '8px 14px', color: MUTED, whiteSpace: 'nowrap' }}>
                          {row.sent_at ? new Date(row.sent_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
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
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: MUTED,
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
  color: '#2D2A22', background: '#fff', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
}
