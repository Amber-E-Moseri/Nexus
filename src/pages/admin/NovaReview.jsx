import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ThumbsDown, HelpCircle, BookOpen, DollarSign, Zap, Database } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'

const STALE_DAYS = 90

function MetricCard({ label, value, subtitle }) {
  return (
    <div
      className="rounded-[10px] border p-4"
      style={{ borderColor: 'var(--border-light)', background: 'var(--surface-secondary)' }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-1 text-[22px] font-bold text-[var(--text-primary)]">{value}</div>
      {subtitle ? <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{subtitle}</div> : null}
    </div>
  )
}

function CostDashboard() {
  const [costData, setCostData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCostData()
  }, [])

  async function loadCostData() {
    setLoading(true)
    const [{ data: monthly }, { data: byIntent }, { data: kbSavings }, { data: cacheData }] =
      await Promise.all([
        supabase.rpc('estimate_nova_monthly_cost'),
        supabase.rpc('nova_cost_by_intent', { p_days: 7 }),
        supabase.rpc('nova_kb_savings_summary', { p_days: 7 }),
        supabase
          .from('nova_audit_log')
          .select('prompt_cache_hit')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ])

    const monthlyRow = monthly?.[0] ?? {}
    const kbRow = kbSavings?.[0] ?? {}
    const cacheRows = cacheData ?? []
    const cacheHits = cacheRows.filter((r) => r.prompt_cache_hit).length
    const cacheHitRate = cacheRows.length > 0 ? ((cacheHits / cacheRows.length) * 100).toFixed(1) : '0'

    setCostData({
      estimatedMonthlyUsd: parseFloat(monthlyRow.estimated_total_usd ?? 0),
      dailyAvgUsd: parseFloat(monthlyRow.daily_avg_usd ?? 0),
      costByIntent: byIntent ?? [],
      totalAskQueries: parseInt(kbRow.total_ask_queries ?? 0),
      kbDirectMatches: parseInt(kbRow.kb_direct_matches ?? 0),
      directMatchRatePct: parseFloat(kbRow.direct_match_rate_pct ?? 0),
      estimatedTokensSaved: parseInt(kbRow.estimated_tokens_saved ?? 0),
      cacheHitRate,
      cacheHits,
      totalCalls: cacheRows.length,
    })
    setLoading(false)
  }

  if (loading) {
    return <div className="py-8 text-center text-[13px] text-[var(--text-secondary)]">Loading cost data…</div>
  }

  if (!costData) return null

  const { estimatedMonthlyUsd, dailyAvgUsd, costByIntent, kbDirectMatches, directMatchRatePct,
          estimatedTokensSaved, cacheHitRate, totalAskQueries, totalCalls } = costData

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="This Month"
          value={`$${estimatedMonthlyUsd.toFixed(3)}`}
          subtitle={`$${dailyAvgUsd.toFixed(3)}/day avg`}
        />
        <MetricCard
          label="Cache Hit Rate (7d)"
          value={`${cacheHitRate}%`}
          subtitle={`${totalCalls} calls tracked`}
        />
        <MetricCard
          label="KB Direct Matches (7d)"
          value={`${directMatchRatePct.toFixed(1)}%`}
          subtitle={`${kbDirectMatches} of ${totalAskQueries} ask queries`}
        />
        <MetricCard
          label="Est. Tokens Saved (7d)"
          value={estimatedTokensSaved.toLocaleString()}
          subtitle="from KB bypasses (~250/call)"
        />
      </div>

      <div>
        <h3 className="mb-2 text-[13px] font-bold text-[var(--text-primary)]">Cost by intent — last 7 days</h3>
        {costByIntent.length === 0 ? (
          <div className="rounded-[10px] border p-4 text-[12.5px] text-[var(--text-secondary)]"
               style={{ borderColor: 'var(--border-light)' }}>
            No cost data yet. Deploy cost columns and redeploy nova-orchestrate first.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border" style={{ borderColor: 'var(--border-light)' }}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--surface-secondary)' }}>
                  {['Intent', 'Calls', 'Avg cost', 'Total cost', '% of spend'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold text-[var(--text-secondary)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costByIntent.map((row) => (
                  <tr key={row.intent}
                      style={{ borderBottom: '1px solid var(--border-light)' }}
                      className="last:border-b-0">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{row.intent}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{row.call_count}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">${(row.avg_cost_cents / 100).toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">${(row.total_cost_cents / 100).toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{row.percent_of_total}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-[10px] border p-4 text-[12px] text-[var(--text-secondary)]"
           style={{ borderColor: 'var(--border-light)', background: 'var(--surface-secondary)' }}>
        <strong>How to read this:</strong> Cache hit rate reduces input token cost to ~10% (Anthropic) or ~50% (OpenAI).
        KB direct matches skip the model call entirely. Both together should keep monthly spend well under $5
        for a ~50-person team on gpt-4o-mini.
      </div>
    </div>
  )
}

const TABS = ['Review Queue', 'Cost Dashboard']

function daysAgo(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export default function NovaReview() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState('Review Queue')
  const [staleEntries, setStaleEntries] = useState([])
  const [flaggedLogs, setFlaggedLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: stale, error: staleErr }, { data: logs, error: logsErr }] = await Promise.all([
      supabase
        .from('nova_kb_entries')
        .select('id, slug, question, feature_area, status, last_reviewed_at')
        .lt('last_reviewed_at', cutoff)
        .order('last_reviewed_at', { ascending: true }),
      supabase
        .from('nova_query_log')
        .select('id, question, track, feedback, user:users(name), created_at')
        .or('feedback.eq.down,track.eq.unanswered')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (staleErr) console.warn('Failed to load stale KB entries:', staleErr)
    if (logsErr) console.warn('Failed to load flagged Nova queries:', logsErr)
    setStaleEntries(stale ?? [])
    setFlaggedLogs(logs ?? [])
    setLoading(false)
  }

  async function markReviewed(entryId) {
    setMarkingId(entryId)
    const { error } = await supabase
      .from('nova_kb_entries')
      .update({ last_reviewed_at: new Date().toISOString() })
      .eq('id', entryId)
    setMarkingId(null)
    if (error) {
      showToast(`Couldn't mark this reviewed: ${error.message}`, { tone: 'error' })
      return
    }
    setStaleEntries((prev) => prev.filter((e) => e.id !== entryId))
    showToast('Marked as reviewed.', { tone: 'success' })
  }

  if (loading && activeTab === 'Review Queue') {
    return <div className="p-6 text-[13px] text-[var(--text-secondary)]">Loading Nova review queue…</div>
  }

  return (
    <div className="mx-auto max-w-[900px] p-2">
      <div className="mb-5">
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className="text-[19px] font-bold text-[var(--text-primary)]">Nova admin</h1>
          <button
            onClick={() => navigate('/nova/kb')}
            className="flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
          >
            <BookOpen size={16} />
            Knowledge base
          </button>
        </div>

        <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border-light)' }}>
          {TABS.map((tab) => {
            const Icon = tab === 'Review Queue' ? AlertTriangle : DollarSign
            const active = activeTab === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors"
                style={{
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                <Icon size={13} />
                {tab}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'Cost Dashboard' ? <CostDashboard /> : (
      <div>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[var(--text-primary)]">
          <AlertTriangle size={16} style={{ color: 'var(--amber)' }} />
          Stale knowledge base entries ({staleEntries.length})
        </h2>
        {staleEntries.length === 0 ? (
          <div className="rounded-[10px] border p-4 text-[12.5px] text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)' }}>
            Nothing older than {STALE_DAYS} days. The knowledge base is current.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--border-light)' }}>
            {staleEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                style={{ borderColor: 'var(--border-light)' }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{entry.question}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                    {entry.feature_area} · {entry.status} · last reviewed {daysAgo(entry.last_reviewed_at)} days ago
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => markReviewed(entry.id)}
                  disabled={markingId === entry.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors hover:bg-[var(--surface-secondary)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <Check size={12} />
                  Mark reviewed
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[var(--text-primary)]">
          <ThumbsDown size={16} style={{ color: 'var(--coral)' }} />
          Flagged questions ({flaggedLogs.length})
        </h2>
        <p className="mb-3 text-[12px] text-[var(--text-secondary)]">
          Thumbs-down responses and questions Nova couldn't answer at all — the real drift signal.
        </p>
        {flaggedLogs.length === 0 ? (
          <div className="rounded-[10px] border p-4 text-[12.5px] text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)' }}>
            No flagged or unanswered questions right now.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--border-light)' }}>
            {flaggedLogs.map((log) => (
              <div key={log.id} className="border-b px-4 py-3 last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
                <div className="text-[13px] text-[var(--text-primary)]">{log.question}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                  {log.track === 'unanswered' ? (
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--amber)' }}>
                      <HelpCircle size={11} /> unanswered
                    </span>
                  ) : (
                    <span>{log.track}</span>
                  )}
                  {log.feedback === 'down' ? (
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--coral)' }}>
                      <ThumbsDown size={11} /> thumbs down
                    </span>
                  ) : null}
                  <span>· {log.user?.name ?? 'Unknown user'}</span>
                  <span>· {new Date(log.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
      )}
    </div>
  )
}
