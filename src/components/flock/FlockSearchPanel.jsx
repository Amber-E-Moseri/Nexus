import { useState } from 'react'
import { Search } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, FLOCK } from '../../lib/flockSupabase'

function badgeTone(r) {
  if (r.outcome === 'Successful') return { fg: FLOCK.green, bg: FLOCK.greenTint }
  if (r.result === 'Left Message') return { fg: FLOCK.amber, bg: FLOCK.amberTint }
  if (r.result === 'Rescheduled Call') return { fg: FLOCK.purple, bg: FLOCK.purpleTint }
  return { fg: FLOCK.red, bg: FLOCK.redTint }
}

/** Highlight case-insensitive matches of `q` inside `text`. */
function Highlighted({ text, q }) {
  const query = String(q || '').trim()
  if (!query) return <>{text}</>
  const parts = []
  const lower = text.toLowerCase()
  const lowerQ = query.toLowerCase()
  let i = 0
  while (i < text.length) {
    const found = lower.indexOf(lowerQ, i)
    if (found === -1) {
      parts.push(text.slice(i))
      break
    }
    if (found > i) parts.push(text.slice(i, found))
    parts.push(
      <mark key={found} style={{ background: FLOCK.purpleTint, color: FLOCK.purple, borderRadius: '3px', padding: '0 2px' }}>
        {text.slice(found, found + query.length)}
      </mark>
    )
    i = found + query.length
  }
  return <>{parts}</>
}

export default function FlockSearchPanel({ onOpenPerson }) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const doSearch = async () => {
    const q = input.trim()
    if (q.length < 2) {
      setError('Type at least 2 characters to search.')
      return
    }
    setLoading(true)
    setError(null)
    setQuery(q)
    try {
      const data = await callFlockAPI('searchInteractions', { query: q })
      const list = data && data.results ? data.results : []
      setResults(list)
      setTotal(data && data.total ? data.total : list.length)
    } catch (e) {
      setError('Search error: ' + String(e.message || e))
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Search</h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted }}>Search across all call notes, names, and results.</p>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} color={FLOCK.muted} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="Search notes, names, results…"
            autoComplete="off"
            style={{
              width: '100%',
              padding: '12px 14px 12px 38px',
              borderRadius: '12px',
              border: `1px solid ${FLOCK.border}`,
              background: FLOCK.card,
              fontSize: '14px',
              color: FLOCK.text,
              fontFamily: FLOCK.fontBody,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          type="button"
          onClick={doSearch}
          disabled={loading}
          style={{ padding: '0 20px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', fontFamily: FLOCK.fontBody }}
        >
          Search
        </button>
      </div>

      {error && <div style={{ fontSize: '13px', color: FLOCK.red }}>{error}</div>}

      {loading ? (
        <div style={{ ...flockCard({ padding: '32px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px' }}>Searching…</div>
      ) : results === null ? (
        <div style={{ ...flockCard({ padding: '40px 24px' }), textAlign: 'center', color: FLOCK.muted }}>
          <Search size={26} style={{ marginBottom: '10px', opacity: 0.4 }} />
          <div style={{ fontSize: '13px' }}>Search across all call notes, names, and results.</div>
        </div>
      ) : results.length === 0 ? (
        <div style={{ ...flockCard({ padding: '32px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px' }}>
          No results for “{query}”
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: FLOCK.muted }}>
            {results.length}
            {total > results.length ? ` of ${total}` : ''} result{total !== 1 ? 's' : ''}
          </div>
          {results.map((r, idx) => {
            const tone = badgeTone(r)
            return (
              <button
                key={r.interactionId || idx}
                type="button"
                onClick={() => onOpenPerson?.(r.personId)}
                style={{ ...flockCard({ padding: '14px 16px' }), textAlign: 'left', cursor: 'pointer', display: 'grid', gap: '8px', fontFamily: FLOCK.fontBody }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: FLOCK.text }}>{r.personName}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontFamily: FLOCK.fontMono, fontSize: '11px', color: FLOCK.muted }}>{r.timestamp}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', color: tone.fg, background: tone.bg }}>
                      {r.result || r.outcome || 'Attempt'}
                    </span>
                  </span>
                </div>
                {r.summary && (
                  <div style={{ fontSize: '13px', lineHeight: 1.5, color: FLOCK.text }}>
                    <Highlighted text={r.summary} q={query} />
                  </div>
                )}
                {r.nextAction && r.nextAction !== 'None' && (
                  <div style={{ fontSize: '12px', color: FLOCK.muted }}>Next: {r.nextAction}</div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
