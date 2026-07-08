import { useEffect, useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, initials, FLOCK } from '../../lib/flockSupabase'

function CadenceRow({ person, onSaved }) {
  const [days, setDays] = useState(String(parseInt(person.cadenceDays, 10) || 28))
  const [active, setActive] = useState(person.active !== false)
  const [savingCad, setSavingCad] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [status, setStatus] = useState(null) // 'ok' | 'err'
  const [invalid, setInvalid] = useState(false)

  const sub = [person.role, person.fellowship].filter(Boolean).join(' · ')

  const flashStatus = (s) => {
    setStatus(s)
    if (s === 'ok') setTimeout(() => setStatus((cur) => (cur === 'ok' ? null : cur)), 2000)
  }

  const saveCad = async () => {
    const n = parseInt(days, 10)
    if (!n || n < 1) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setSavingCad(true)
    setStatus(null)
    try {
      const res = await callFlockAPI('saveCadence', { personId: person.id, cadenceDays: n })
      if (res && res.success) {
        onSaved?.(person.id, { cadenceDays: n })
        flashStatus('ok')
      } else {
        flashStatus('err')
      }
    } catch {
      flashStatus('err')
    } finally {
      setSavingCad(false)
    }
  }

  const toggleActive = async () => {
    const next = !active
    setActive(next)
    setTogglingActive(true)
    setStatus(null)
    try {
      const res = await callFlockAPI('setActive', { personId: person.id, active: next ? 'true' : 'false' })
      if (res && res.success) {
        onSaved?.(person.id, { active: next })
        flashStatus('ok')
      } else {
        setActive(!next)
        flashStatus('err')
      }
    } catch {
      setActive(!next)
      flashStatus('err')
    } finally {
      setTogglingActive(false)
    }
  }

  return (
    <div style={flockCard({ padding: '14px 16px', display: 'grid', gap: '12px' })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: FLOCK.purpleTint, color: FLOCK.purple, display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
          {initials(person.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: FLOCK.text }}>{person.name}</div>
          {sub && <div style={{ fontSize: '12px', color: FLOCK.muted, marginTop: '2px' }}>{sub}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: active ? FLOCK.green : FLOCK.muted }}>{active ? 'Active' : 'Inactive'}</span>
          <button
            type="button"
            onClick={toggleActive}
            disabled={togglingActive}
            aria-pressed={active}
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '999px',
              border: 'none',
              cursor: togglingActive ? 'wait' : 'pointer',
              background: active ? FLOCK.purple : FLOCK.borderStrong,
              position: 'relative',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '2px',
                left: active ? '20px' : '2px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#FFFFFF',
                transition: 'left 0.15s',
              }}
            />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input
          type="number"
          min="1"
          max="365"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          style={{
            width: '84px',
            padding: '8px 10px',
            border: `1px solid ${invalid ? FLOCK.red : FLOCK.border}`,
            borderRadius: '8px',
            fontSize: '14px',
            fontFamily: FLOCK.fontMono,
            color: FLOCK.text,
            outline: 'none',
          }}
        />
        <span style={{ fontSize: '13px', color: FLOCK.muted }}>days between calls</span>
        <button
          type="button"
          onClick={saveCad}
          disabled={savingCad}
          style={{
            padding: '8px 16px',
            background: FLOCK.purple,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: savingCad ? 'wait' : 'pointer',
            fontFamily: FLOCK.fontBody,
            opacity: savingCad ? 0.7 : 1,
          }}
        >
          {savingCad ? '…' : 'Save'}
        </button>
        {status === 'ok' && <Check size={16} color={FLOCK.green} />}
        {status === 'err' && <X size={16} color={FLOCK.red} />}
        {person.isDefault && <span style={{ marginLeft: 'auto', fontSize: '11px', color: FLOCK.muted }}>default</span>}
      </div>
    </div>
  )
}

export default function FlockCadencePanel() {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await callFlockAPI('getPeopleWithCadence')
      setPeople(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e.message || 'Could not load contacts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onSaved = (id, patch) => {
    setPeople((cur) => cur.map((p) => (String(p.id) === String(id) ? { ...p, ...patch } : p)))
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => String(p.name || '').toLowerCase().includes(q))
  }, [people, query])

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>People Settings</h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted }}>Set call cadence and toggle active status for each person.</p>
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
        <div style={{ ...flockCard({ padding: '28px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px' }}>Loading contacts…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...flockCard({ padding: '28px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px' }}>No contacts match.</div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {filtered.map((p) => (
            <CadenceRow key={p.id} person={p} onSaved={onSaved} />
          ))}
        </div>
      )}
    </div>
  )
}
