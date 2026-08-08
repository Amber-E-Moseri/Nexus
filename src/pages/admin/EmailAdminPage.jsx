import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { Send, Mail, Monitor, RefreshCw, ChevronDown, ChevronUp, Eye, EyeOff, Smartphone } from 'lucide-react'
import { sanitizeEmailHtml } from '../../features/communications/lib/communications'

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

const HTML_TEMPLATES = [
  {
    id: 'basic',
    name: 'Basic',
    preview: 'Simple centered text',
    html: `<table style="width:100%;border-collapse:collapse;margin:0;padding:0;">
<tr><td style="padding:32px 28px;background:#faf8f5;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;color:#4c2a92;line-height:1.2;">Headline Here</h1>
    <p style="margin:0;font-size:15px;color:#5a5248;line-height:1.6;">Supporting tagline or description</p>
  </div>
  <p style="margin:0 0 16px;font-size:14px;color:#2d2a22;line-height:1.8;">Hi {{firstName}},</p>
  <p style="margin:0 0 24px;font-size:14px;color:#5a5248;line-height:1.8;">Your message content goes here.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://nexus.lwcanada.org" style="display:inline-block;padding:14px 32px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">CTA</a>
  </div>
</td></tr>
</table>`
  },
  {
    id: 'featured',
    name: 'Featured Card',
    preview: 'Hero + card + CTA',
    html: `<table style="width:100%;border-collapse:collapse;margin:0;padding:0;">
<tr><td style="padding:32px 28px;background:#faf8f5;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;color:#4c2a92;">Feature Name</h1>
    <p style="margin:0;font-size:15px;color:#5a5248;">One-line description</p>
  </div>
  <p style="margin:0 0 16px;font-size:14px;color:#2d2a22;">Hi {{firstName}},</p>
  <div style="margin:24px 0;padding:20px;background:#fff;border-radius:10px;border:1px solid #e8dedd;">
    <h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#4c2a92;">What's New</h3>
    <p style="margin:0 0 12px;font-size:13px;color:#5a5248;line-height:1.6;">Describe the feature benefit here.</p>
    <ul style="margin:8px 0;padding-left:20px;font-size:13px;color:#5a5248;">
      <li>Key benefit 1</li>
      <li>Key benefit 2</li>
      <li>Key benefit 3</li>
    </ul>
  </div>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://nexus.lwcanada.org" style="display:inline-block;padding:14px 32px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">Get Started</a>
  </div>
</td></tr>
</table>`
  },
  {
    id: 'twocol',
    name: 'Two Column',
    preview: 'Side-by-side layout',
    html: `<table style="width:100%;border-collapse:collapse;margin:0;padding:0;">
<tr><td style="padding:32px 28px;background:#faf8f5;">
  <h1 style="text-align:center;margin:0 0 24px;font-size:26px;font-weight:800;color:#4c2a92;">Announcement</h1>
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:0 12px;width:50%;vertical-align:top;">
        <div style="padding:16px;background:#fff;border-radius:8px;border:1px solid #e8dedd;">
          <h3 style="margin:0 0 8px;font-size:14px;font-weight:700;color:#4c2a92;">Column 1</h3>
          <p style="margin:0;font-size:13px;color:#5a5248;line-height:1.6;">Content for the left column here.</p>
        </div>
      </td>
      <td style="padding:0 12px;width:50%;vertical-align:top;">
        <div style="padding:16px;background:#fff;border-radius:8px;border:1px solid #e8dedd;">
          <h3 style="margin:0 0 8px;font-size:14px;font-weight:700;color:#4c2a92;">Column 2</h3>
          <p style="margin:0;font-size:13px;color:#5a5248;line-height:1.6;">Content for the right column here.</p>
        </div>
      </td>
    </tr>
  </table>
  <div style="text-align:center;margin:32px 0 0;">
    <a href="https://nexus.lwcanada.org" style="display:inline-block;padding:12px 28px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">Learn More</a>
  </div>
</td></tr>
</table>`
  }
]

function getStarterTemplate() {
  return HTML_TEMPLATES[0].html
}

function buildStandardAnnouncementHtml(form, frontendUrl = 'https://nexus.lwcanada.org') {
  const year = new Date().getFullYear()
  const benefits = form.benefits
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 3)

  const benefitRows = benefits.map(b => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f0ebe2;font-size:13px;color:#2d2a22;">
        <span style="margin-right:10px;">✓</span>${b}
      </td>
    </tr>`).join('')

  const ctaUrl = (form.cta_url || '/').startsWith('http')
    ? form.cta_url
    : `${frontendUrl}${form.cta_url || '/'}`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<table style="width:100%;border-collapse:collapse;max-width:600px;margin:0 auto;">
<tr><td style="background:#fff;padding:0;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg, #4c2a92 0%, #6b3fb5 100%);padding:32px 28px;">
    <p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Nexus</p>
    <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:20px;padding:6px 14px;margin-bottom:16px;">
      <span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.06em;text-transform:uppercase;">What's New</span>
    </div>
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#fff;line-height:1.2;">${form.feature_name || 'Feature Name'}</h1>
    <p style="margin:0;font-size:16px;color:rgba(255,255,255,0.85);line-height:1.5;">${form.tagline || ''}</p>
  </div>

  <!-- Body -->
  <div style="padding:32px 28px;">
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#2d2a22;">Hi {{firstName}},</p>
    <div style="margin:0 0 28px;font-size:14px;line-height:1.8;color:#5a5248;white-space:pre-wrap;">${form.description || 'Description goes here.'}</div>

    ${benefits.length > 0 ? `
    <div style="margin:28px 0;background:#faf8f5;border-radius:12px;border:1px solid #e8dedd;padding:0;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;margin:0;padding:0;">
        <tbody style="margin:0;padding:16px;">
          ${benefitRows}
        </tbody>
      </table>
    </div>` : ''}

    <!-- CTA -->
    <div style="margin:32px 0;text-align:center;">
      <a href="${ctaUrl}" style="display:inline-block;padding:16px 40px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;transition:background 0.2s ease;">${form.cta_label || 'Get started'}</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#f9f7f5;border-top:1px solid #e8dedd;padding:20px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9e9488;line-height:1.6;">
      You're receiving this as an active Nexus user.
      <br />
      <a href="${frontendUrl}/settings" style="color:#4c2a92;text-decoration:none;font-weight:500;">Unsubscribe from announcements</a>
      <br />
      © ${year} Nexus
    </p>
  </div>

</td></tr>
</table>
</body>
</html>`
}

function buildPreviewHtml(form, emailFormat = 'standard', frontendUrl = 'https://nexus.lwcanada.org') {
  if (emailFormat === 'html') {
    // Custom HTML mode - wrap provided HTML with Nexus footer
    const year = new Date().getFullYear()
    const sanitized = form.customHtml ? sanitizeEmailHtml(form.customHtml) : ''
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<table style="width:100%;border-collapse:collapse;max-width:600px;margin:0 auto;">
<tr><td style="background:#fff;">
  ${sanitized || '<p style="padding:28px;color:#9e9488;text-align:center;">Paste your custom HTML above</p>'}
  <div style="background:#f9f7f5;border-top:1px solid #e8dedd;padding:20px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9e9488;line-height:1.6;">
      You're receiving this as an active Nexus user.
      <br />
      <a href="${frontendUrl}/settings" style="color:#4c2a92;text-decoration:none;font-weight:500;">Unsubscribe from announcements</a>
      <br />
      © ${year} Nexus
    </p>
  </div>
</td></tr>
</table>
</body>
</html>`
  }
  return buildStandardAnnouncementHtml(form, frontendUrl)
}

export default function EmailAdminPage() {
  const { profile } = useAuth()
  const toast = useToast()

  // Email format mode: 'standard' or 'html'
  const [emailFormat, setEmailFormat] = useState('standard')

  const [form, setForm] = useState({
    subject: '',
    feature_name: '',
    tagline: '',
    description: '',
    benefits: '',
    cta_label: 'Go to Dashboard',
    cta_url: 'https://nexus.lwcanada.org',
    customHtml: '',
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
  const [previewMode, setPreviewMode] = useState('desktop') // 'desktop' | 'mobile'
  const iframeRef = useRef(null)

  // Send state
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [showSendConfirm, setShowSendConfirm] = useState(false)
  const [testSending, setTestSending] = useState(false)

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
      iframeRef.current.srcdoc = buildPreviewHtml(form, emailFormat)
    }
  }, [form, showPreview, emailFormat])

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

  async function validateForm() {
    if (!form.subject) {
      toast?.showToast('Email subject is required', { tone: 'error' })
      return false
    }
    if (emailFormat === 'standard') {
      if (!form.feature_name || !form.description || !form.cta_url || !form.cta_label) {
        toast?.showToast('Fill in all required fields', { tone: 'error' })
        return false
      }
    } else {
      if (!form.customHtml) {
        toast?.showToast('Custom HTML is required', { tone: 'error' })
        return false
      }
    }
    if (audienceMode === 'department' && selectedDepts.length === 0) {
      toast?.showToast('Select at least one department', { tone: 'error' })
      return false
    }
    if (audienceMode === 'role' && selectedRoles.length === 0) {
      toast?.showToast('Select at least one role', { tone: 'error' })
      return false
    }
    return true
  }

  async function sendEmail(isTest = false) {
    if (!validateForm()) return

    const isSending = isTest ? setTestSending : setSending
    isSending(true)
    setSendResult(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const payload = {
        format: emailFormat,
        subject: form.subject,
      }

      if (emailFormat === 'standard') {
        const benefits = form.benefits.split('\n').map(l => l.trim()).filter(Boolean)
        payload.feature_name = form.feature_name
        payload.tagline = form.tagline || undefined
        payload.description = form.description
        payload.benefits = benefits
        payload.cta_label = form.cta_label
        payload.cta_url = form.cta_url
      } else {
        payload.customHtml = form.customHtml
      }

      // Test mode: send only to admin's email
      if (isTest) {
        payload.test_recipient_email = profile?.email
      } else {
        if (audienceMode === 'department' && selectedDepts.length > 0) {
          payload.department_ids = selectedDepts
        } else if (audienceMode === 'role' && selectedRoles.length > 0) {
          payload.roles = selectedRoles
        }
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
      setSendResult({ ok: res.ok, ...result, isTest })
      if (res.ok) {
        if (isTest) {
          toast?.showToast('Test email sent to your inbox', { tone: 'success' })
        } else {
          toast?.showToast(`Sent to ${result.sent} users`, { tone: 'success' })
          setForm(f => ({ ...f, subject: '', feature_name: '', tagline: '', description: '', benefits: '', customHtml: '' }))
          loadLogs()
          setTimeout(() => setSendResult(null), 5000)
        }
      } else {
        toast?.showToast(result.error ?? 'Send failed', { tone: 'error' })
      }
    } catch (err) {
      setSendResult({ ok: false, error: err.message })
      toast?.showToast(err.message, { tone: 'error' })
    } finally {
      isSending(false)
    }
  }

  async function handleSend() {
    if (!validateForm()) return
    setShowSendConfirm(false)
    await sendEmail(false)
  }

  async function handleTestSend() {
    await sendEmail(true)
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

          <form onSubmit={e => { e.preventDefault(); setShowSendConfirm(true) }} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Email format mode selector */}
            <div>
              <label style={labelStyle}>Email format</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { id: 'standard', label: 'Standard Template' },
                  { id: 'html', label: 'Advanced HTML' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEmailFormat(opt.id)}
                    style={{
                      padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${emailFormat === opt.id ? PRIMARY : BORDER}`,
                      background: emailFormat === opt.id ? PRIMARY + '12' : '#fff',
                      color: emailFormat === opt.id ? PRIMARY : MUTED,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

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

            {/* Email subject */}
            <div>
              <label style={labelStyle}>Email subject *</label>
              <input
                value={form.subject || (emailFormat === 'standard' && form.feature_name ? `New in Nexus: ${form.feature_name}` : '')}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder={emailFormat === 'standard' ? 'New in Nexus: Feature Name' : 'Email subject'}
                style={inputStyle}
                required
              />
              {emailFormat === 'standard' && !form.subject && form.feature_name && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: MUTED }}>Default: New in Nexus: {form.feature_name}</p>
              )}
            </div>

            {emailFormat === 'standard' ? (
              <>
                {/* Standard template fields */}
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
                    placeholder="Explain the feature. Preserve line breaks for better readability." rows={4}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} required />
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: MUTED }}>Blank lines will be preserved in the email.</p>
                </div>

                <div>
                  <label style={labelStyle}>Benefits (one per line, optional)</label>
                  <textarea value={form.benefits} onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))}
                    placeholder={'Drag tasks to update status\nSee due dates at a glance\nFilter by assignee'} rows={3}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: MUTED }}>Up to 3 benefits will display. Each line becomes a bullet point.</p>
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
              </>
            ) : (
              <>
                {/* Advanced HTML mode */}
                <div>
                  <label style={labelStyle}>Template Library</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {HTML_TEMPLATES.map(tmpl => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, customHtml: tmpl.html }))}
                        style={{
                          padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          border: `1px solid ${BORDER}`, background: '#fff',
                          color: MUTED, cursor: 'pointer', transition: 'all .13s',
                        }}
                        title={tmpl.preview}
                      >
                        {tmpl.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Custom Email HTML *</label>
                  <textarea
                    value={form.customHtml}
                    onChange={e => setForm(f => ({ ...f, customHtml: e.target.value }))}
                    placeholder="Paste your email HTML here. Use {{firstName}} and {{fullName}} for personalization."
                    rows={8}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                    required
                  />
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: MUTED }}>
                    Use inline CSS and table-based layouts for email compatibility.
                    <br />
                    Available variables: <strong>{'{{'} firstName {'}}'}</strong>, <strong>{'{{'} fullName {'}}'}</strong>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(form.customHtml)
                      toast?.showToast('HTML copied to clipboard', { tone: 'success' })
                    }}
                    style={{
                      marginTop: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                      border: `1px solid ${BORDER}`, borderRadius: 6, background: '#fff',
                      color: MUTED, cursor: 'pointer',
                    }}
                  >
                    📋 Copy HTML
                  </button>
                </div>
              </>
            )}

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
              <div
                onClick={() => setShowPreview(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 50,
                  background: 'rgba(45,42,34,0.18)',
                  backdropFilter: 'blur(2px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: '#fff', borderRadius: 14, overflow: 'hidden',
                    boxShadow: '0 8px 40px rgba(45,42,34,0.12)',
                    border: `1px solid ${BORDER}`,
                    display: 'flex', flexDirection: 'column',
                    maxHeight: '90vh',
                  }}
                >
                  <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ fontSize: 11, color: MUTED }}>
                      Subject: <strong style={{ color: TEXT }}>{form.subject || (emailFormat === 'standard' && form.feature_name ? `New in Nexus: ${form.feature_name}` : '(No subject)')}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {['desktop', 'mobile'].map(mode => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPreviewMode(mode)}
                          style={{
                            padding: '4px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                            border: `1px solid ${previewMode === mode ? PRIMARY : BORDER}`,
                            background: previewMode === mode ? PRIMARY + '12' : '#fff',
                            color: previewMode === mode ? PRIMARY : MUTED,
                            cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          {mode === 'desktop' ? <Monitor size={11} /> : <Smartphone size={11} />}
                          {mode === 'mobile' ? 'Mobile' : 'Desktop'}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowPreview(false)}
                        style={{ marginLeft: 4, padding: '4px 8px', borderRadius: 4, border: `1px solid ${BORDER}`, background: '#fff', fontSize: 11, color: MUTED, cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: '16px', background: '#f9f7f5', display: 'flex', justifyContent: 'center', overflowY: 'auto' }}>
                    <iframe
                      ref={iframeRef}
                      srcDoc={buildPreviewHtml(form, emailFormat)}
                      style={{
                        width: previewMode === 'desktop' ? 600 : 375,
                        height: previewMode === 'desktop' ? 560 : 680,
                        border: 'none',
                        display: 'block',
                        borderRadius: 6,
                        boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                      }}
                      sandbox="allow-same-origin"
                      title="Email preview"
                    />
                  </div>
                </div>
              </div>
            )}

            {sendResult && (
              <div style={{
                padding: '12px 14px', borderRadius: 8, fontSize: 13,
                background: sendResult.ok ? '#e8f5e9' : '#fce4ec',
                color: sendResult.ok ? GREEN : RED,
              }}>
                {sendResult.ok ? (
                  <div>
                    {sendResult.isTest
                      ? '✅ Test email sent to your inbox. Check it out, then send to all users.'
                      : `✅ Sent to ${sendResult.sent} user${sendResult.sent !== 1 ? 's' : ''}.${sendResult.skipped ? ` ${sendResult.skipped} unsubscribed.` : ''}`}
                  </div>
                ) : (
                  <div>❌ Error: {sendResult.error ?? 'Unknown error'}</div>
                )}
                {sendResult.errors?.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>Failed: {sendResult.errors.slice(0, 2).join('; ')}{sendResult.errors.length > 2 ? '…' : ''}</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleTestSend}
                disabled={testSending || sending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '9px 14px', background: testSending ? MUTED : '#fff',
                  color: testSending ? '#fff' : PRIMARY, border: `1.5px solid ${testSending ? MUTED : PRIMARY}`,
                  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: testSending || sending ? 'not-allowed' : 'pointer',
                }}
              >
                {testSending ? 'Sending test…' : '📧 Send test to me'}
              </button>
              <button
                type="submit"
                disabled={sending || testSending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', background: sending || testSending ? MUTED : PRIMARY,
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, cursor: sending || testSending ? 'not-allowed' : 'pointer',
                }}
              >
                <Send size={14} />
                {sending ? 'Sending…' : 'Send announcement'}
              </button>
              <span style={{ fontSize: 12, color: MUTED }}>All users opted in by default • Users can unsubscribe in settings</span>
            </div>
          </form>
        </div>

        {/* Send Confirmation Modal */}
        {showSendConfirm && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              background: '#fff', borderRadius: 12, padding: 28,
              maxWidth: 400, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: TEXT }}>Send announcement?</h2>
              <div style={{ marginBottom: 20, fontSize: 13, color: '#5a5248', lineHeight: 1.6 }}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: TEXT, marginBottom: 4 }}>Audience:</div>
                  <div style={{ color: MUTED }}>
                    {audienceMode === 'all'
                      ? 'All active users'
                      : audienceMode === 'department'
                        ? selectedDepts.length === 1
                          ? `1 department`
                          : `${selectedDepts.length} departments`
                        : selectedRoles.length === 1
                          ? `1 role`
                          : `${selectedRoles.length} roles`
                    }
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: TEXT, marginBottom: 4 }}>Recipients:</div>
                  <div style={{ color: MUTED }}>~{recipientCount || '?'} eligible users</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: TEXT, marginBottom: 4 }}>Subject:</div>
                  <div style={{ color: MUTED }}>{form.subject || (emailFormat === 'standard' && form.feature_name ? `New in Nexus: ${form.feature_name}` : '(No subject)')}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowSendConfirm(false)}
                  style={{
                    flex: 1, padding: '10px 14px', border: `1px solid ${BORDER}`,
                    borderRadius: 8, background: '#fff', color: TEXT, fontSize: 13,
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  style={{
                    flex: 1, padding: '10px 14px', background: sending ? MUTED : PRIMARY,
                    border: 'none', borderRadius: 8, color: '#fff', fontSize: 13,
                    fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? 'Sending…' : 'Send announcement'}
                </button>
              </div>
            </div>
          </div>
        )}

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
