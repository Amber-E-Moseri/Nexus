import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle, ArrowUp, ArrowDown, X, UserX, UserCheck } from 'lucide-react'
import { rowOpenProps } from './ParticipantTable.jsx'
import SelectCheckbox from './SelectCheckbox.jsx'
import { attentionCategoryKeys } from '../lib/documentationRules.js'
import { groupForSubgroup } from '../lib/subgroups.js'
import { registrationState, REGISTRATION_STATE, REGISTRATION_STATE_LABELS } from '../lib/documentationRules.js'

const DASH = <span className="icplc-wl-muted">—</span>

const isAbsent = (p) => p.participation_status === 'not_attending'

const regStateOf = (p) => registrationState(p) // registered | registration_missing | not_registered (one canonical derivation)
const isRegistered = (p) => regStateOf(p) === REGISTRATION_STATE.REGISTERED
const isCommittedToAttend = (p) => p.participation_status === 'confirmed' || p.participation_status === 'likely'

function phoneOf(p) {
  return p.phone_number || p.phone || p.source_values?.phone_number?.value || ''
}

const handleOf = (p) => (p.kingschat_username ? String(p.kingschat_username).replace(/^@/, '') : '')
const attentionOf = (p) => attentionCategoryKeys(p).filter((k) => k !== 'not_registered' && k !== 'registration_missing')
const humanize = (k) => k.replace(/_/g, ' ')

// Column definitions: how to sort, and (optionally) which values a cell click can filter on.
const groupOf = (p) => groupForSubgroup(p.subgroup) || p.group_name || ''

const COLUMNS = {
  name: { label: 'Name', sort: (p) => (p.full_name || '').toLowerCase() },
  group: { label: 'Group', sort: (p) => groupOf(p).toLowerCase(), values: (p) => (groupOf(p) ? [groupOf(p)] : []) },
  subgroup: { label: 'Subgroup', sort: (p) => (p.subgroup || '').toLowerCase(), values: (p) => (p.subgroup ? [p.subgroup] : []) },
  campus: { label: 'Campus', sort: (p) => (p.region || '').toLowerCase(), values: (p) => (p.region ? [p.region] : []) },
  phone: { label: 'Phone', sort: (p) => phoneOf(p) },
  kingschat: { label: 'KingsChat', sort: (p) => handleOf(p).toLowerCase() },
  registered: { label: 'Registered', sort: (p) => ({ registered: 2, registration_missing: 1, not_registered: 0 })[regStateOf(p)], values: (p) => [REGISTRATION_STATE_LABELS[regStateOf(p)]] },
  attention: { label: 'Attention', sort: (p) => attentionOf(p).length, values: (p) => attentionOf(p).map(humanize) },
}

/**
 * Compact Working List table. Click a header to sort; click a Subgroup / Campus /
 * Registered / Attention value to filter to it (click again, or the chip, to clear).
 */
export default function WorkingListTable({ participants, loading, onOpen, onToggleAbsent, selection }) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [cellFilters, setCellFilters] = useState([]) // [{ column, value }]
  const selectionEnabled = Boolean(selection)

  const rows = useMemo(() => {
    let list = participants || []
    for (const { column, value } of cellFilters) {
      list = list.filter((p) => COLUMNS[column].values(p).includes(value))
    }
    if (sort.key) {
      const get = COLUMNS[sort.key].sort
      const mult = sort.dir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        const av = get(a), bv = get(b)
        // Blanks always sink to the bottom regardless of direction.
        if (av === '' && bv !== '') return 1
        if (bv === '' && av !== '') return -1
        return av < bv ? -mult : av > bv ? mult : 0
      })
    }
    return list
  }, [participants, cellFilters, sort])

  // Selection follows exactly the rows rendered here (after the column filters below), never the unfiltered list.
  const syncShown = selection?.syncShown
  useEffect(() => { syncShown?.(rows) }, [syncShown, rows])

  function toggleSort(key) {
    setSort((s) => (s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }))
  }

  function toggleFilter(column, value) {
    selection?.clear() // a column filter changes what is shown; do not carry the old selection over
    setCellFilters((cur) => (
      cur.some((f) => f.column === column && f.value === value)
        ? cur.filter((f) => !(f.column === column && f.value === value))
        : [...cur.filter((f) => f.column !== column), { column, value }]
    ))
  }

  const isFiltered = (column, value) => cellFilters.some((f) => f.column === column && f.value === value)

  function FilterCell({ column, value, children }) {
    const active = isFiltered(column, value)
    return (
      <button
        type="button"
        className={`icplc-wl-filter${active ? ' is-active' : ''}`}
        title={active ? `Clear filter: ${value}` : `Filter by ${COLUMNS[column].label.toLowerCase()}: ${value}`}
        aria-pressed={active}
        onClick={(e) => { e.stopPropagation(); toggleFilter(column, value) }}
      >
        {children ?? value}
      </button>
    )
  }

  function Th({ k, style }) {
    const active = sort.key === k
    return (
      <th scope="col" style={style} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="icplc-wl-sort" onClick={() => toggleSort(k)}>
          {COLUMNS[k].label}
          {active && (sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
        </button>
      </th>
    )
  }

  if (loading) {
    return <div role="status" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading participants…</div>
  }
  if (!(participants || []).length) {
    return <div role="status" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No participants match current filters.</div>
  }

  return (
    <div>
      {cellFilters.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--icplc-text-soft, var(--text-secondary))' }}>
            Showing {rows.length} of {participants.length}:
          </span>
          {cellFilters.map(({ column, value }) => (
            <button key={column} type="button" className="icplc-chip" aria-pressed="true"
              onClick={() => toggleFilter(column, value)} title="Clear this filter">
              {COLUMNS[column].label}: {value} <X size={12} aria-hidden style={{ marginLeft: 4 }} />
            </button>
          ))}
          <button type="button" onClick={() => { selection?.clear(); setCellFilters([]) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
            Clear
          </button>
        </div>
      )}

      <div className="icplc-wl-wrap">
        <table className="icplc-wl-table">
          <thead>
            <tr>
              {selection && (
                <th scope="col" className="icplc-wl-select">
                  <SelectCheckbox
                    checked={selection.allShownSelected}
                    indeterminate={selection.someSelected}
                    onChange={selection.toggleAllShown}
                    label={`Select all ${rows.length} shown`}
                  />
                </th>
              )}
              <th scope="col" className="icplc-wl-num">#</th>
              <Th k="name" />
              <Th k="group" />
              <Th k="subgroup" />
              <Th k="campus" />
              <Th k="phone" />
              <Th k="kingschat" />
              <Th k="registered" style={{ textAlign: 'center' }} />
              <Th k="attention" />
              {onToggleAbsent && <th scope="col" style={{ textAlign: 'center' }}>Absent</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={(onToggleAbsent ? 10 : 9) + (selectionEnabled ? 1 : 0)} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>No participants match these column filters.</td></tr>
            )}
            {rows.map((p, i) => {
              const registered = isRegistered(p)
              const regState = regStateOf(p)
              const attention = attentionOf(p)
              const phone = phoneOf(p)
              const handle = handleOf(p)
              return (
                <tr
                  key={p.id}
                  {...rowOpenProps(p.full_name, () => onOpen(p.id))}
                  className={`icplc-row icplc-wl-row ${registered ? 'is-registered' : 'is-unregistered'}${isAbsent(p) ? ' is-absent' : ''}`}
                >
                  {selection && (
                    <td className="icplc-wl-select">
                      <SelectCheckbox
                        checked={selection.isSelected(p.id)}
                        onChange={() => selection.toggle(p.id)}
                        label={`Select ${p.full_name}`}
                      />
                    </td>
                  )}
                  <td className="icplc-wl-num">{i + 1}</td>
                  <td className="icplc-wl-name">{p.full_name}</td>
                  <td className="icplc-wl-muted">{groupOf(p) ? <FilterCell column="group" value={groupOf(p)} /> : DASH}</td>
                  <td className="icplc-wl-muted">{p.subgroup ? <FilterCell column="subgroup" value={p.subgroup} /> : DASH}</td>
                  <td className="icplc-wl-muted">{p.region ? <FilterCell column="campus" value={p.region} /> : DASH}</td>
                  <td className="icplc-wl-phone">{phone || DASH}</td>
                  <td className="icplc-wl-muted">{handle ? `@${handle}` : DASH}</td>
                  <td style={{ textAlign: 'center' }}>
                    <FilterCell column="registered" value={REGISTRATION_STATE_LABELS[regState]}>
                      {registered ? (
                        <CheckCircle2 size={18} color="#16A34A" aria-label="Registered" />
                      ) : regState === 'registration_missing' ? (
                        <span
                          aria-label="Registration missing"
                          style={{ background: isCommittedToAttend(p) ? '#FBE4E2' : '#FDF0DC', color: isCommittedToAttend(p) ? '#B42318' : '#A15C07', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}
                        >
                          {isCommittedToAttend(p) ? 'URGENT · Missing' : 'Missing'}
                        </span>
                      ) : isCommittedToAttend(p) ? (
                        <span
                          aria-label="Not registered"
                          style={{ background: '#FBE4E2', color: '#B42318', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}
                        >
                          URGENT · Not registered
                        </span>
                      ) : (
                        <XCircle size={18} color="#DC2626" aria-label="Not registered" />
                      )}
                    </FilterCell>
                  </td>
                  <td className="icplc-wl-muted">
                    {attention.length
                      ? attention.slice(0, 2).map((k, idx) => (
                        <React.Fragment key={k}>
                          {idx > 0 && ', '}
                          <FilterCell column="attention" value={humanize(k)} />
                        </React.Fragment>
                      ))
                      : DASH}
                    {attention.length > 2 && ` +${attention.length - 2}`}
                  </td>
                  {onToggleAbsent && (
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="icplc-wl-filter"
                        title={isAbsent(p) ? 'Not attending — click to clear' : 'Mark not attending (absent)'}
                        aria-pressed={isAbsent(p)}
                        aria-label={isAbsent(p) ? `Clear not attending for ${p.full_name}` : `Mark ${p.full_name} not attending`}
                        onClick={(e) => { e.stopPropagation(); onToggleAbsent(p) }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {isAbsent(p) ? <UserX size={17} color="#B42318" /> : <UserCheck size={17} color="#9A93AE" />}
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
