import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { FONT_HEADING } from '../../lib/fonts'
import {
  getScheduledCampaigns,
  getFailedCampaigns,
  getBounceMetrics,
  retryCampaign,
} from '../../features/communications/lib/communications'
import { Send, Clock, AlertTriangle, MailX, Users, FileText, BarChart3, UserX } from 'lucide-react'

const PRIMARY = 'var(--purple-700)'
const BORDER = 'var(--border-1)'
const TEXT = 'var(--ink-1)'
const MUTED = 'var(--ink-3)'
const BG = 'var(--surface-sub)'

const STATUS_STYLE = {
  draft:     { bg: 'var(--surface-sub)', color: 'var(--ink-2)' },
  scheduled: { bg: 'var(--accent-blue-tint)', color: 'var(--accent-blue-text)' },
  sending:   { bg: 'var(--accent-yellow-tint)', color: 'var(--accent-yellow-text)' },
  sent:      { bg: 'var(--accent-green-tint)', color: 'var(--accent-green-text)' },
  failed:    { bg: 'var(--accent-red-tint)', color: 'var(--accent-red-text)' },
  retrying:  { bg: 'var(--accent-yellow-tint)', color: 'var(--accent-yellow-text)' },
  cancelled: { bg: 'var(--surface-sub)', color: 'var(--ink-2)' },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft
  return (
    <span style={{ display: 'inline-block', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, textTransform: 'capitalize' }}>
      {status}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, tint, tintText }) {
  return (
    <div style={{ flex: '1 1 160px', minWidth: 150, background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: tint, color: tintText, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

function Card({ title, action, children }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ children }) {
  return <div style={{ padding: '28px 18px', textAlign: 'center', color: MUTED, fontSize: 13 }}>{children}</div>
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const QUICK_LINKS = [
  { to: '/communications/recipients', label: 'Manage recipients', icon: Users },
  { to: '/communications/templates', label: 'Email templates', icon: FileText },
  { to: '/communications/analytics', label: 'Analytics & bounces', icon: BarChart3 },
  { to: '/communications/absentees', label: 'Absentee follow-up', icon: UserX },
]

export default function CommunicationsOverview() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [scheduled, setScheduled] = useState([])
  const [failed, setFailed] = useState([])
  const [bounces, setBounces] = useState({ total_bounced: 0, suppressed_count: 0 })
  const [recent, setRecent] = useState([])
  const [retrying, setRetrying] = useState(null)

  async function loadAll() {
    setLoading(true)
    const [scheduledData, failedData, bounceData, recentRes] = await Promise.all([
      getScheduledCampaigns(supabase),
      getFailedCampaigns(supabase),
      getBounceMetrics(supabase),
      supabase
        .from('communication_campaigns')
        .select('id, name, subject, status, sent_at, recipient_count, sent_count, open_count, created_at')
        .order('created_at', { ascending: false })
        .limit(6),
    ])
    setScheduled(scheduledData)
    setFailed(failedData)
    setBounces(bounceData)
    setRecent(recentRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function handleRetry(campaignId) {
    setRetrying(campaignId)
    await retryCampaign(supabase, campaignId)
    await loadAll()
    setRetrying(null)
  }

  const sentThisMonth = recent.filter((c) => {
    if (c.status !== 'sent' || !c.sent_at) return false
    const sentAt = new Date(c.sent_at)
    const now = new Date()
    return sentAt.getMonth() === now.getMonth() && sentAt.getFullYear() === now.getFullYear()
  }).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 14px', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <h1 style={{ fontFamily: FONT_HEADING, margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Overview</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>
          Campaigns, scheduled sends, and list health at a glance.
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: BG }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 13 }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatCard icon={Send} label="Sent this month" value={sentThisMonth} tint="var(--accent-green-tint)" tintText="var(--accent-green-text)" />
              <StatCard icon={Clock} label="Scheduled" value={scheduled.length} tint="var(--accent-blue-tint)" tintText="var(--accent-blue-text)" />
              <StatCard icon={AlertTriangle} label="Needs attention" value={failed.length} tint="var(--accent-yellow-tint)" tintText="var(--accent-yellow-text)" />
              <StatCard icon={MailX} label="Suppressed emails" value={bounces.suppressed_count ?? 0} tint="var(--accent-red-tint)" tintText="var(--accent-red-text)" />
            </div>

            {failed.length > 0 ? (
              <Card title="Needs attention">
                {failed.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${BG}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                        {c.failed_count ?? 0} of {c.recipient_count ?? 0} failed · last error {formatDateTime(c.last_error_at)}
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                    <button
                      type="button"
                      onClick={() => handleRetry(c.id)}
                      disabled={retrying === c.id}
                      style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: retrying === c.id ? 'not-allowed' : 'pointer', opacity: retrying === c.id ? 0.6 : 1 }}
                    >
                      {retrying === c.id ? 'Retrying...' : 'Retry'}
                    </button>
                  </div>
                ))}
              </Card>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              <Card
                title="Upcoming sends"
                action={
                  <button type="button" onClick={() => navigate('/communications/campaigns')} style={{ border: 'none', background: 'none', color: PRIMARY, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    View all
                  </button>
                }
              >
                {scheduled.length === 0 ? (
                  <EmptyState>
                    Nothing scheduled.{' '}
                    <button type="button" onClick={() => navigate('/communications/compose')} style={{ border: 'none', background: 'none', color: PRIMARY, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                      Create a campaign
                    </button>
                  </EmptyState>
                ) : (
                  scheduled.map((c) => (
                    <div key={c.id} style={{ padding: '12px 18px', borderBottom: `1px solid ${BG}` }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                        {formatDateTime(c.scheduled_at)} · {c.recipient_count ?? 0} recipients
                      </div>
                    </div>
                  ))
                )}
              </Card>

              <Card
                title="Recent campaigns"
                action={
                  <button type="button" onClick={() => navigate('/communications/campaigns')} style={{ border: 'none', background: 'none', color: PRIMARY, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    View all
                  </button>
                }
              >
                {recent.length === 0 ? (
                  <EmptyState>
                    No campaigns yet.{' '}
                    <button type="button" onClick={() => navigate('/communications/compose')} style={{ border: 'none', background: 'none', color: PRIMARY, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                      Create your first campaign
                    </button>
                  </EmptyState>
                ) : (
                  recent.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${BG}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                          {c.status === 'sent'
                            ? `${c.sent_count ?? 0} sent · ${c.open_count ?? 0} opened`
                            : `Created ${formatDateTime(c.created_at)}`}
                        </div>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))
                )}
              </Card>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {QUICK_LINKS.map(({ to, label, icon: Icon }) => (
                <button
                  key={to}
                  type="button"
                  onClick={() => navigate(to)}
                  style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 10, background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', fontSize: 13, fontWeight: 700, color: TEXT, cursor: 'pointer', textAlign: 'left' }}
                >
                  <Icon size={16} style={{ color: PRIMARY, flexShrink: 0 }} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
