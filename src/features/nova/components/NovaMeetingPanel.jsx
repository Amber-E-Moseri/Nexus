import { useState } from 'react'
import { CalendarClock, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react'
import { askNovaOrchestrate } from '../lib/novaApi'
import NovaMarkdown from './NovaMarkdown'
import SourceChip from './SourceChip'

export default function NovaMeetingPanel({ meetingId, meetingTitle }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function run() {
    if (loading) return
    setResult(null)
    setError(null)
    setLoading(true)
    setOpen(true)

    try {
      const response = await askNovaOrchestrate({
        intent: 'meeting_prep',
        message: `Prepare me for the meeting: ${meetingTitle}`,
        context: { meetingId, confirmed: true },
      })
      setResult(response)
    } catch (err) {
      setError(err?.message || 'Nova could not process that request.')
    } finally {
      setLoading(false)
    }
  }

  function close() {
    setOpen(false)
    setResult(null)
    setError(null)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => open && (result || error) ? close() : run()}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 20,
          background: open && (result || error) ? 'var(--accent)' : 'transparent',
          border: `1px solid ${open && (result || error) ? 'var(--accent)' : 'var(--border)'}`,
          color: open && (result || error) ? '#fff' : 'var(--accent)',
          fontSize: 12, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.12s',
        }}
      >
        <CalendarClock size={13} />
        Prepare with Nova
        {open && (result || error) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div style={{
          marginTop: 12, padding: 16,
          background: 'var(--surface-secondary)',
          border: '1px solid var(--border-light)',
          borderRadius: 10,
          position: 'relative',
        }}>
          <button
            type="button"
            onClick={close}
            style={{
              position: 'absolute', top: 10, right: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', padding: 4,
            }}
          >
            <X size={14} />
          </button>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
              <Sparkles size={14} style={{ animation: 'spin 1.2s linear infinite', color: 'var(--accent)' }} />
              Preparing your brief…
            </div>
          )}

          {error && !loading && (
            <div style={{ fontSize: 13, color: 'var(--color-error, #DC2626)' }}>{error}</div>
          )}

          {result && !loading && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Meeting Brief — {meetingTitle}
              </div>
              <NovaMarkdown content={result.answer} />
              {result.sources?.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.sources.map((s) => (
                    <SourceChip key={`${s.type}-${s.id}`} source={s} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
