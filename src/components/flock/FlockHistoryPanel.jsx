import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Phone, Search, RefreshCw } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, initials, FLOCK } from '../../lib/flockSupabase'

/** Colour a result/outcome badge the way the standalone Past-Notes page does. */
function badgeTone(i) {
  if (i.outcome === 'Successful') return { fg: FLOCK.green, bg: FLOCK.greenTint }
  if (i.result === 'Left Message') return { fg: FLOCK.amber, bg: FLOCK.amberTint }
  if (i.result === 'Rescheduled Call') return { fg: FLOCK.purple, bg: FLOCK.purpleTint }
  return { fg: FLOCK.red, bg: FLOCK.redTint }
}

function InteractionCard({ i }) {
  const tone = badgeTone(i)
  return (
    <div style={flockCard({ padding: '14px 16px', borderRadius: '12px', boxShadow: 'none', background: FLOCK.surface })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontFamily: FLOCK.fontMono, fontSize: '12px', color: FLOCK.muted }}>
          {i.timestamp || '—'}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 9px',
            borderRadius: '999px',
            color: tone.fg,
            background: tone.bg,
            fontFamily: FLOCK.fontBody,
            whiteSpace: 'nowrap',
          }}
        >
          {i.result || i.outcome || 'Attempt'}
        </span>
      </div>
      {i.summary && (
        <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.5, color: FLOCK.text, fontFamily: FLOCK.fontBody }}>
          {i.summary}
        </div>
      )}
      {i.nextAction && i.nextAction !== 'None' && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: FLOCK.purple, fontWeight: 600, fontFamily: FLOCK.fontBody }}>
          Next: {i.nextAction}
          {i.nextDt ? <span style={{ fontFamily: FLOCK.fontMono, fontWeight: 400 }}> · {i.nextDt}</span> : null}
        </div>
      )}
    </div>
  )
}

function PersonRow({ person, expanded, onToggle }) {
  const [interactions, setInteractions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await callFlockAPI('getInteractions', { personId: person.id })
      setInteractions(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message || 'Could not load history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (expanded && interactions === null && !loading) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  return (
    <div style={flockCard({ padding: 0, overflow: 'hidden' })}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: FLOCK.fontBody,
        }}
      >
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            background: FLOCK.purpleTint,
            color: FLOCK.purple,
            display: 'grid',
            placeItems: 'center',
            fontSize: '12px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials(person.name)}
        </div>
        <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: FLOCK.text }}>{person.name}</span>
        {expanded ? <ChevronDown size={16} color={FLOCK.muted} /> : <ChevronRight size={16} color={FLOCK.muted} />}
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px', display: 'grid', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: FLOCK.muted,
                background: 'none',
                border: 'none',
                cursor: loading ? 'wait' : 'pointer',
                fontFamily: FLOCK.fontBody,
              }}
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
          {loading && <div style={{ fontSize: '13px', color: FLOCK.muted }}>Loading history…</div>}
          {error && <div style={{ fontSize: '13px', color: FLOCK.red }}>{error}</div>}
          {!loading && !error && interactions && interactions.length === 0 && (
            <div style={{ fontSize: '13px', color: FLOCK.muted }}>No call history yet.</div>
          )}
          {!loading && !error && interactions && interactions.map((i, idx) => (
            <InteractionCard key={i.id || idx} i={i} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FlockHistoryPanel({ preselectId = null }) {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState(preselectId)

  // When arriving from a Search result, expand that person's history.
  useEffect(() => {
    if (preselectId) setExpandedId(preselectId)
  }, [preselectId])

  const loadPeople = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await callFlockAPI('people')
      setPeople(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message || 'Could not load contacts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPeople()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => String(p.name || '').toLowerCase().includes(q))
  }, [people, query])

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>
          Past Notes
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted, fontFamily: FLOCK.fontBody }}>
          Select a person to view their call history.
        </p>
      </div>

      <div style={{ position: 'relative' }}>
        <Search size={15} color={FLOCK.muted} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
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

      {error && <div style={{ fontSize: '13px', color: FLOCK.red }}>{error}</div>}

      {loading ? (
        <div style={{ ...flockCard({ padding: '24px' }), textAlign: 'center', color: FLOCK.muted, fontFamily: FLOCK.fontBody }}>
          <Phone size={18} style={{ marginBottom: '8px', opacity: 0.5 }} />
          <div style={{ fontSize: '13px' }}>Loading contacts…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...flockCard({ padding: '24px' }), textAlign: 'center', color: FLOCK.muted, fontFamily: FLOCK.fontBody, fontSize: '13px' }}>
          No contacts found.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {filtered.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              expanded={expandedId === person.id}
              onToggle={() => setExpandedId(expandedId === person.id ? null : person.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
