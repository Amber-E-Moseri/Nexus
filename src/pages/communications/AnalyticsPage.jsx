import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER  = '#EDE8DC'
const TEXT    = '#2D2A22'
const MUTED   = '#9E9488'
const BG      = '#F4F1EA'
const SUCCESS = '#2D6A4F'
const ERROR   = '#C94830'

function StatTile({ label, value, sub, color, flash }) {
  return (
    <div style={{
      flex: '1 1 160px',
      background: '#FFFFFF',
      border: flash ? `2px solid ${PRIMARY}` : `1px solid ${BORDER}`,
      borderRadius: 14,
      padding: '18px 20px',
      transition: 'border-color 0.3s ease',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: MUTED, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? TEXT }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{sub}</div> : null}
    </div>
  )
}

const TIPS = [
  'Always include an unsubscribe link — it is required by CAN-SPAM and CASL.',
  'Send during weekday mornings (9–11 AM local time) for higher open rates.',
  'Keep subject lines under 50 characters and avoid ALL CAPS words.',
  'Use plain text paragraphs: short paragraphs scan better on mobile.',
  'Avoid spam trigger words: "free", "act now", "guaranteed", excessive exclamation marks.',
  'Warm up new sending domains gradually — start with small batches.',
  'Authenticated SPF, DKIM, and DMARC records improve deliverability significantly.',
  'Segment your audience: targeted emails consistently outperform blast sends.',
]

function pct(num, denom) {
  if (!denom) return '—'
  return `${Math.round((num / denom) * 100)}%`
}

function StatusBadge({ status }) {
  const map = {
    sent:      { bg: '#EBF7F1', color: SUCCESS },
    scheduled: { bg: '#E8EEFA', color: '#1A56DB' },
    draft:     { bg: BG,        color: MUTED },
    failed:    { bg: '#FEF0ED', color: ERROR },
    cancelled: { bg: BG,        color: MUTED },
  }
  const s = map[status] ?? map.draft
  return (
    <span style={{ display: 'inline-block', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
      {status}
    </span>
  )
}

// ─── Campaign Drilldown ──────────────────────────────────────────────────────

function CampaignDrilldown({ campaign }) {
  const [sends, setSends]           = useState([])
  const [abTest, setAbTest]         = useState(null)
  const [clicks, setClicks]         = useState([])
  const [bounces, setBounces]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [filterStatus, setFilter]   = useState('all')
  const [markingWinner, setMarking] = useState(false)
  const [winnerMsg, setWinnerMsg]   = useState(null)
  const [flashOpensTile, setFlashOpensTile] = useState(false)

  useEffect(() => {
    setLoading(true)
    setSends([])
    setAbTest(null)
    setClicks([])
    setBounces([])
    setWinnerMsg(null)

    Promise.all([
      supabase.from('communication_sends').select('*').eq('campaign_id', campaign.id).order('created_at'),
      supabase.from('communication_ab_tests').select('*').eq('campaign_id', campaign.id).maybeSingle(),
      supabase.from('campaign_link_clicks').select('*').eq('campaign_id', campaign.id).catch(() => ({ data: [] })),
      supabase.from('email_bounces').select('*').eq('campaign_id', campaign.id).catch(() => ({ data: [] })),
    ]).then(([sendsRes, abRes, clicksRes, bouncesRes]) => {
      setSends(sendsRes.data ?? [])
      setAbTest(abRes.data ?? null)
      setClicks(clicksRes.data ?? [])
      setBounces(bouncesRes.data ?? [])
      setLoading(false)
    })
  }, [campaign.id])

  // Realtime subscription for opens in sent campaigns
  useEffect(() => {
    if (campaign.status !== 'sent') return

    const channel = supabase
      .channel(`campaign-sends-${campaign.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'communication_sends',
          filter: `campaign_id=eq.${campaign.id}`,
        },
        (payload) => {
          const updated = payload.new
          const prev = payload.old
          // If opened_at was just set, increment counter and flash tile
          if (!prev.opened_at && updated.opened_at) {
            setFlashOpensTile(true)
            setTimeout(() => setFlashOpensTile(false), 1000)
          }
          // Update the specific row in local state
          setSends((prevSends) =>
            prevSends.map((s) => (s.id === updated.id ? updated : s))
          )
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [campaign.id, campaign.status])

  const delivered = useMemo(() => sends.filter((s) => s.status !== 'failed' && s.status !== 'bounced').length, [sends])
  const opened    = useMemo(() => sends.filter((s) => s.status === 'opened').length, [sends])
  const failed    = useMemo(() => sends.filter((s) => s.status === 'failed' || s.status === 'bounced').length, [sends])
  const totalClicks = useMemo(() => clicks.reduce((acc, c) => acc + (c.click_count ?? 1), 0), [clicks])

  // Link performance: unique clickers per URL
  const linkPerformance = useMemo(() => {
    const grouped = {}
    clicks.forEach((c) => {
      if (!grouped[c.link_url]) {
        grouped[c.link_url] = { url: c.link_url, clicks: 0, unique_clickers: new Set() }
      }
      grouped[c.link_url].clicks += c.click_count ?? 1
      if (c.clicker_email) grouped[c.link_url].unique_clickers.add(c.clicker_email)
    })
    return Object.values(grouped)
      .map((item) => ({ ...item, unique_clickers: item.unique_clickers.size }))
      .sort((a, b) => b.clicks - a.clicks)
  }, [clicks])

  // Engagement timeline: opens + clicks by hour
  const engagementTimeline = useMemo(() => {
    const hours = Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 }))
    sends.forEach((s) => {
      if (s.opened_at) {
        const date = new Date(s.opened_at)
        const hour = date.getHours()
        hours[hour].count += 1
      }
    })
    clicks.forEach((c) => {
      if (c.clicked_at) {
        const date = new Date(c.clicked_at)
        const hour = date.getHours()
        if (hours[hour]) hours[hour].count += (c.click_count ?? 1)
      }
    })
    return hours.filter((h) => h.count > 0).length >= 3 ? hours : null
  }, [sends, clicks])

  // Export CSV
  function exportCSV() {
    const headers = ['Email', 'Name', 'Status', 'Opened At', 'Error']
    const rows = sends.map((s) => [
      `"${s.recipient_email}"`,
      `"${s.recipient_name ?? ''}"`,
      `"${s.status}"`,
      `"${s.opened_at ? new Date(s.opened_at).toLocaleString() : ''}"`,
      `"${s.error_message ?? ''}"`,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${campaign.name.replace(/\s+/g, '_')}_sends.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return sends
    return sends.filter((s) => s.status === filterStatus)
  }, [sends, filterStatus])

  // A/B test: has the test window expired?
  const abExpired = useMemo(() => {
    if (!abTest?.test_duration_hours || !campaign.sent_at) return false
    const sentAt  = new Date(campaign.sent_at).getTime()
    const expires = sentAt + abTest.test_duration_hours * 3_600_000
    return Date.now() > expires
  }, [abTest, campaign.sent_at])

  async function markWinner(variant) {
    if (!abTest) return
    setMarking(true)
    // Try RPC first to get computed rates, then fall back to manual mark
    const { data: rpcData } = await supabase.rpc('select_ab_test_winner', { p_campaign_id: campaign.id }).maybeSingle().catch(() => ({ data: null }))
    const computedVariant = rpcData?.winning_variant ?? variant
    const subject = computedVariant === 'a' ? abTest.subject_a : abTest.subject_b
    const rateA   = rpcData?.open_rate_a ?? abTest.open_rate_a
    const rateB   = rpcData?.open_rate_b ?? abTest.open_rate_b

    const { error } = await supabase
      .from('communication_ab_tests')
      .update({ winner_subject: subject, open_rate_a: rateA, open_rate_b: rateB })
      .eq('id', abTest.id)
    if (!error) {
      setAbTest((prev) => ({ ...prev, winner_subject: subject, open_rate_a: rateA, open_rate_b: rateB }))
      setWinnerMsg(`Winner: Subject ${computedVariant.toUpperCase()} — "${subject}" (${Math.round((rpcData ? (computedVariant === 'a' ? rateA : rateB) : 0) * 100)}% opens)`)
    }
    setMarking(false)
  }

  // Engagement chart component
  function EngagementChart() {
    if (!engagementTimeline) {
      return <div style={{ fontSize: 13, color: MUTED }}>Not enough data to display timeline.</div>
    }
    const maxCount = Math.max(...engagementTimeline.map((h) => h.count))
    const width = 800
    const height = 200
    const padding = 40
    const graphWidth = width - padding * 2
    const graphHeight = height - padding * 2
    const barWidth = graphWidth / 24
    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding + graphHeight * (1 - ratio)
          const val = Math.round(maxCount * ratio)
          return (
            <g key={i}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke={BORDER} strokeWidth={1} strokeDasharray="2,2" />
              <text x={padding - 8} y={y} textAnchor="end" dy="0.3em" fontSize="11" fill={MUTED}>{val}</text>
            </g>
          )
        })}
        {/* Bars */}
        {engagementTimeline.map((h) => {
          const x = padding + h.hour * barWidth + barWidth * 0.1
          const barHeight = (h.count / maxCount) * graphHeight
          const y = padding + graphHeight - barHeight
          return (
            <rect
              key={h.hour}
              x={x}
              y={y}
              width={barWidth * 0.8}
              height={barHeight}
              fill={PRIMARY}
              rx={2}
            />
          )
        })}
        {/* X axis labels */}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => {
          const x = padding + hour * barWidth + barWidth * 0.5
          return (
            <text key={hour} x={x} y={height - 10} textAnchor="middle" fontSize="11" fill={MUTED}>
              {hour}h
            </text>
          )
        })}
        {/* Axes */}
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke={TEXT} strokeWidth={1} />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke={TEXT} strokeWidth={1} />
      </svg>
    )
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: MUTED, fontSize: 13 }}>Loading campaign data...</div>
  }

  const bounceRate = sends.length ? (failed / sends.length) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatTile label="Recipients"    value={(campaign.recipient_count ?? sends.length).toLocaleString()} />
        <StatTile label="Delivered"     value={delivered.toLocaleString()} sub={pct(delivered, sends.length)} color={PRIMARY} />
        <StatTile label="Opens"         value={opened.toLocaleString()}    sub={pct(opened, delivered)} color={PRIMARY} flash={flashOpensTile} />
        <StatTile label="Clicks"        value={totalClicks.toLocaleString()} sub={pct(totalClicks, delivered)} color="#1A56DB" />
        <StatTile label="Bounced / Failed" value={failed.toLocaleString()} sub={pct(failed, sends.length)} color={failed > 0 ? ERROR : TEXT} />
      </div>

      {/* Bounce warning */}
      {bounceRate > 5 && (
        <div style={{ background: '#FEF0ED', border: `1px solid #F5C4B8`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: ERROR, fontWeight: 600 }}>
          ⚠ Bounce rate is {Math.round(bounceRate)}% — above 5%. High bounce rates damage domain reputation.
          Consider cleaning your list before the next send.
        </div>
      )}

      {/* A/B Test panel */}
      {abTest ? (
        <div style={{ background: '#F4F0FC', border: `1px solid #D5CCE9`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: PRIMARY, marginBottom: 10 }}>A/B Test Results</div>
          {winnerMsg ? (
            <div style={{ fontSize: 13, color: SUCCESS, fontWeight: 600, marginBottom: 10 }}>{winnerMsg}</div>
          ) : null}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {['a', 'b'].map((v) => {
              const subject = v === 'a' ? abTest.subject_a : abTest.subject_b
              const rate    = v === 'a' ? abTest.open_rate_a : abTest.open_rate_b
              const isWinner = abTest.winner_subject === subject
              return (
                <div
                  key={v}
                  style={{
                    flex: '1 1 200px',
                    background: isWinner ? '#EBF7F1' : '#FFFFFF',
                    border: `1px solid ${isWinner ? '#A8D5BC' : BORDER}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>
                    Subject {v.toUpperCase()} {isWinner ? '✓ Winner' : ''}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{subject}</div>
                  {rate != null ? (
                    <div style={{ fontSize: 22, fontWeight: 800, color: isWinner ? SUCCESS : TEXT }}>{Math.round(rate * 100)}% opens</div>
                  ) : (
                    <div style={{ fontSize: 12, color: MUTED }}>Open rate pending</div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: abExpired && !abTest.winner_subject ? 10 : 0 }}>
            Split: {abTest.split_percent}% test group · Metric: {abTest.metric} · Duration: {abTest.test_duration_hours}h
            {abExpired ? '' : ' (test still running)'}
          </div>
          {abExpired && !abTest.winner_subject ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: TEXT, fontWeight: 600, alignSelf: 'center' }}>Test complete — select winner:</div>
              <button
                type="button"
                disabled={markingWinner}
                onClick={() => markWinner('a')}
                style={{ border: `1px solid #D5CCE9`, background: '#FFFFFF', color: PRIMARY, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Subject A
              </button>
              <button
                type="button"
                disabled={markingWinner}
                onClick={() => markWinner('b')}
                style={{ border: `1px solid #D5CCE9`, background: '#FFFFFF', color: PRIMARY, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Subject B
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Link Performance */}
      {clicks.length > 0 ? (
        <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 800, color: TEXT }}>
            Link Performance
          </div>
          {linkPerformance.length === 0 ? (
            <div style={{ padding: '16px', color: MUTED, fontSize: 13 }}>No link click data recorded yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: BG }}>
                    {['URL', 'Clicks', 'Unique Clickers'].map((h) => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: MUTED, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linkPerformance.slice(0, 10).map((item) => {
                    const urlDisplay = item.url.length > 50 ? `${item.url.slice(0, 50)}…` : item.url
                    return (
                      <tr key={item.url} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '9px 14px', color: TEXT, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', title: item.url }}>
                          <a href={item.url} target="_blank" rel="noreferrer" style={{ color: PRIMARY }}>{urlDisplay}</a>
                        </td>
                        <td style={{ padding: '9px 14px', color: MUTED, fontWeight: 700 }}>{item.clicks}</td>
                        <td style={{ padding: '9px 14px', color: MUTED }}>{item.unique_clickers}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px', color: MUTED, fontSize: 13 }}>
          No link click data recorded yet.
        </div>
      )}

      {/* Engagement Timeline */}
      <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginBottom: 12 }}>Engagement over time</div>
        <EngagementChart />
      </div>

      {/* Bounce Breakdown */}
      {bounces.length > 0 ? (
        <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 800, color: TEXT }}>
            Bounces
          </div>
          <div style={{ padding: '12px 16px', fontSize: 12, color: MUTED, borderBottom: `1px solid ${BORDER}`, fontStyle: 'italic' }}>
            Hard bounces are permanent failures. Repeated soft bounces auto-suppress the address.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: BG }}>
                  {['Email', 'Bounce Type', 'Bounced At'].map((h) => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: MUTED, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bounces.map((b) => (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '9px 14px', color: TEXT }}>{b.bounced_email}</td>
                    <td style={{ padding: '9px 14px', color: TEXT, textTransform: 'capitalize' }}>{b.bounce_type ?? 'bounce'}</td>
                    <td style={{ padding: '9px 14px', color: MUTED, fontSize: 11 }}>{b.bounced_at ? new Date(b.bounced_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Send log */}
      <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>Send Log</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'opened', 'failed', 'bounced'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{ border: `1px solid ${filterStatus === f ? PRIMARY : BORDER}`, background: filterStatus === f ? '#EDE8F8' : '#FFFFFF', color: filterStatus === f ? PRIMARY : MUTED, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button
              type="button"
              onClick={exportCSV}
              style={{ border: `1px solid ${PRIMARY}`, background: PRIMARY, color: '#FFFFFF', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Export CSV
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: BG }}>
                {['Email', 'Name', 'Status', 'Opened At', 'Error'].map((h) => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: MUTED, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '9px 14px', color: TEXT }}>{s.recipient_email}</td>
                  <td style={{ padding: '9px 14px', color: TEXT }}>{s.recipient_name ?? '—'}</td>
                  <td style={{ padding: '9px 14px' }}><StatusBadge status={s.status} /></td>
                  <td style={{ padding: '9px 14px', color: MUTED, fontSize: 11 }}>{s.opened_at ? new Date(s.opened_at).toLocaleString() : '—'}</td>
                  <td style={{ padding: '9px 14px', color: ERROR, fontSize: 11 }}>{s.error_message ?? '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: MUTED, fontSize: 13 }}>No records.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('campaign_id') ?? ''

  const [campaigns, setCampaigns]   = useState([])
  const [unsubscribes, setUnsubscribes] = useState([])
  const [loading, setLoading]       = useState(true)
  const [tipIndex, setTipIndex]     = useState(0)

  useEffect(() => {
    Promise.all([
      supabase.from('communication_campaigns').select('*').order('sent_at', { ascending: false }),
      supabase.from('communication_unsubscribes').select('*').order('unsubscribed_at', { ascending: false }),
    ]).then(([campRes, unsubRes]) => {
      setCampaigns(campRes.data ?? [])
      setUnsubscribes(unsubRes.data ?? [])
      setLoading(false)
    })
  }, [])

  const sentCampaigns = useMemo(() => campaigns.filter((c) => c.status === 'sent'), [campaigns])
  const selectedCampaign = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId])

  const totals = useMemo(() => {
    const sent   = sentCampaigns.reduce((acc, c) => acc + (c.sent_count ?? 0), 0)
    const opens  = sentCampaigns.reduce((acc, c) => acc + (c.open_count ?? 0), 0)
    const failed = sentCampaigns.reduce((acc, c) => acc + (c.failed_count ?? 0), 0)
    return { sent, opens, failed }
  }, [sentCampaigns])

  const openRateData = useMemo(() => {
    return sentCampaigns
      .filter((c) => c.sent_at && c.sent_count)
      .slice(0, 12)
      .reverse()
      .map((c) => ({
        name: c.name.length > 16 ? `${c.name.slice(0, 14)}…` : c.name,
        openRate: c.sent_count ? Math.round(((c.open_count ?? 0) / c.sent_count) * 100) : 0,
      }))
  }, [sentCampaigns])

  const unsubByReason = useMemo(() => {
    const counts = {}
    unsubscribes.forEach((u) => {
      const via = u.unsubscribed_via ?? 'unknown'
      counts[via] = (counts[via] ?? 0) + 1
    })
    return Object.entries(counts).map(([via, count]) => ({ via, count }))
  }, [unsubscribes])

  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 8000)
    return () => clearInterval(interval)
  }, [])

  function selectCampaign(id) {
    if (id) {
      setSearchParams({ campaign_id: id })
    } else {
      setSearchParams({})
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px 0', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => navigate('/communications')} style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, padding: 0 }}>
            {'<-'} Communications
          </button>
          <span style={{ color: '#D8D3C9' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Analytics</span>
          {selectedCampaign ? (
            <>
              <span style={{ color: '#D8D3C9' }}>/</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{selectedCampaign.name}</span>
            </>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>
              {selectedCampaign ? selectedCampaign.name : 'Email Analytics'}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>
              {selectedCampaign
                ? `${selectedCampaign.status} · ${selectedCampaign.sent_at ? new Date(selectedCampaign.sent_at).toLocaleDateString() : 'not sent'}`
                : 'Delivery, open rates, and unsubscribes across all campaigns.'}
            </p>
          </div>
          {/* Campaign selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedId ? (
              <button
                type="button"
                onClick={() => selectCampaign('')}
                style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                ← All campaigns
              </button>
            ) : null}
            <select
              value={selectedId}
              onChange={(e) => selectCampaign(e.target.value)}
              style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: TEXT, background: '#FFFFFF', minWidth: 220 }}
            >
              <option value="">— All campaigns —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', background: BG, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 13 }}>Loading...</div>
        ) : selectedCampaign ? (
          // ── Per-campaign drilldown ──
          <CampaignDrilldown campaign={selectedCampaign} />
        ) : (
          // ── Aggregate view ──
          <>
            {/* Stat tiles */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatTile label="Campaigns sent"  value={sentCampaigns.length} />
              <StatTile label="Total delivered" value={totals.sent.toLocaleString()} />
              <StatTile label="Total opens"     value={totals.opens.toLocaleString()} sub={`${pct(totals.opens, totals.sent)} avg open rate`} color={PRIMARY} />
              <StatTile label="Failed"          value={totals.failed.toLocaleString()} sub={pct(totals.failed, totals.sent + totals.failed)} color={totals.failed > 0 ? ERROR : TEXT} />
              <StatTile label="Unsubscribes"    value={unsubscribes.length.toLocaleString()} color={unsubscribes.length > 10 ? ERROR : TEXT} />
            </div>

            {/* Open rate trend */}
            {openRateData.length > 0 ? (
              <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginBottom: 14 }}>
                  Open Rate by Campaign (last {openRateData.length})
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={openRateData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} tickLine={false} axisLine={false} />
                    <YAxis unit="%" tick={{ fontSize: 10, fill: MUTED }} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip formatter={(value) => [`${value}%`, 'Open Rate']} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BORDER}` }} />
                    <Line type="monotone" dataKey="openRate" stroke={PRIMARY} strokeWidth={2} dot={{ r: 4, fill: PRIMARY }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {/* Campaign performance table — rows are clickable to drilldown */}
            <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>Campaign Performance</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Click a campaign to view detailed analytics.</div>
              </div>
              {sentCampaigns.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: MUTED, fontSize: 13 }}>No sent campaigns yet.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: BG }}>
                        {['Campaign', 'Sent', 'Opens', 'Open Rate', 'Failed', 'Date'].map((h) => (
                          <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: MUTED, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${BORDER}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sentCampaigns.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => selectCampaign(c.id)}
                          style={{ borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = BG }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: PRIMARY }}>{c.name}</td>
                          <td style={{ padding: '10px 14px', color: MUTED }}>{c.sent_count ?? 0}</td>
                          <td style={{ padding: '10px 14px', color: MUTED }}>{c.open_count ?? 0}</td>
                          <td style={{ padding: '10px 14px', color: PRIMARY, fontWeight: 700 }}>{pct(c.open_count ?? 0, c.sent_count ?? 0)}</td>
                          <td style={{ padding: '10px 14px', color: c.failed_count ? ERROR : MUTED }}>{c.failed_count ?? 0}</td>
                          <td style={{ padding: '10px 14px', color: MUTED, fontSize: 11 }}>{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Unsubscribes + tip */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginBottom: 12 }}>Unsubscribes by Method</div>
                {unsubByReason.length === 0 ? (
                  <div style={{ fontSize: 13, color: MUTED }}>No unsubscribes recorded.</div>
                ) : unsubByReason.map(({ via, count }) => (
                  <div key={via} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 13 }}>
                    <span style={{ color: TEXT, textTransform: 'capitalize' }}>{via}</span>
                    <span style={{ fontWeight: 700, color: PRIMARY }}>{count}</span>
                  </div>
                ))}
              </div>

              <div style={{ flex: '1 1 320px', background: 'linear-gradient(135deg, #4C2A92, #6B3FD4)', borderRadius: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,0.6)' }}>Deliverability tip</div>
                <div style={{ fontSize: 14, color: '#FFFFFF', lineHeight: 1.6, fontWeight: 500 }}>{TIPS[tipIndex]}</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                  {TIPS.map((_, i) => (
                    <div
                      key={i}
                      onClick={() => setTipIndex(i)}
                      style={{ width: 6, height: 6, borderRadius: 999, background: i === tipIndex ? '#FFFFFF' : 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
