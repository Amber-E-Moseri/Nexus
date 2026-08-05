import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ThumbsDown, HelpCircle, BookOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'

const STALE_DAYS = 90

function daysAgo(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export default function NovaReview() {
  const navigate = useNavigate()
  const { showToast } = useToast()
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

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--text-secondary)]">Loading Nova review queue…</div>
  }

  return (
    <div className="mx-auto max-w-[900px] p-2">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className="text-[19px] font-bold text-[var(--text-primary)]">Nova review queue</h1>
          <button
            onClick={() => navigate('/nova/kb')}
            className="flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
          >
            <BookOpen size={16} />
            Knowledge base
          </button>
        </div>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          This is a to-do list, not a dashboard — every row here either has stale content or a
          real signal that Nova got something wrong. Work through it, don't just glance at it.
        </p>
      </div>

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
  )
}
