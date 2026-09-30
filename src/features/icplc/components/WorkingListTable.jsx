import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle, ArrowUp, ArrowDown, X, UserX, UserCheck } from 'lucide-react'
import { rowOpenProps } from './ParticipantTable.jsx'
import { attentionCategoryKeys } from '../lib/documentationRules.js'
import { groupForSubgroup } from '../lib/subgroups.js'

const DASH = <span className="icplc-wl-muted">—</span>

const isAbsent = (p) => p.participation_status === 'not_attending'

function isRegistered(p) {
  return (p.registration_link_status || p.registration_status) === 'registered'
}

function phoneOf(p) {
  return p.phone_number || p.phone || p.source_values?.phone_number?.value || ''
}

const handleOf = (p) => (p.kingschat_username ? String(p.kingschat_username).replace(/^@/, '') : '')
const attentionOf = (p) => attentionCategoryKeys(p).filter((k) => k !== 'not_registered')
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
  registered: { label: 'Registered', sort: (p) => (isRegistered(p) ? 1 : 0), values: (p) => [isRegistered(p) ? 'Registered' : 'Not registered'] },
  attention: { label: 'Attention', sort: (p) => attentionOf(p).length, values: (p) => attentionOf(p).map(humanize) },
}

/**
 * Compact Working List table. Click a header to sort; click a Subgroup / Campus /
 * Registered / Attention value to filter to it (click again, or the chip, to clear).
 */
export default function WorkingListTable({ participants, loading, onOpen, onToggleAbsent, selectedIds, onToggleSelect, onSetSelection }) {
  const selectable = !!selectedIds && !!onToggleSelect
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [cellFilters, setCellFilters] = useState([]) // [{ column, value }]

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

  // Selection only ever covers rows currently shown, so a bulk action can't touch people hidden by a filter.
  useEffect(() => {
    if (!selectable || selectedIds.size === 0) return
    const shown = new Set(rows.map((r) => r.id))
    const kept = [...selectedIds].filter((id) => shown.has(id))
    if (kept.length !== selectedIds.size) onSetSelection(kept)
  }, [rows, selectable, selectedIds, onSetSelection])

  const shownSelected = selectable ? rows.filter((r) => selectedIds.has(r.id)).length : 0
  const allShownSelected = rows.length > 0 && shownSelected === rows.length
  const someShownSelected = shownSelected > 0

  function toggleSort(key) {
    setSort((s) => (s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }))
  }

  function toggleFilter(column, value) {
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
          <button type="button" onClick={() => setCellFilters([])}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
            Clear
          </button>
        </div>
      )}

      <div className="icplc-wl-wrap">
        <table className="icplc-wl-table">
          <thead>
            <tr>
              {selectable && (
                <th scope="col" style={{ width: 32, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    aria-label={allShownSelected ? 'Deselect everyone shown' : 'Select everyone shown'}
                    checked={allShownSelected}
                    ref={(el) => { if (el) el.indeterminate = someShownSelected && !allShownSelected }}
                    onChange={() => onSetSelection(allShownSelected ? [] : rows.map((r) => r.id))}
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
              <tr><td colSpan={(onToggleAbsent ? 10 : 9) + (selectable ? 1 : 0)} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>No participants match these column filters.</td></tr>
            )}
            {rows.map((p, i) => {
              const registered = isRegistered(p)
              const attention = attentionOf(p)
              const phone = phoneOf(p)
              const handle = handleOf(p)
              return (
                <tr
                  key={p.id}
                  {...rowOpenProps(p.full_name, () => onOpen(p.id))}
                  className={`icplc-row icplc-wl-row ${registered ? 'is-registered' : 'is-unregistered'}${isAbsent(p) ? ' is-absent' : ''}`}
                >
                  {selectable && (
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.full_name}`}
                        checked={selectedIds.has(p.id)}
                        onChange={() => onToggleSelect(p.id)}
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
                    <FilterCell column="registered" value={registered ? 'Registered' : 'Not registered'}>
                      {registered
                        ? <CheckCircle2 size={18} color="#16A34A" aria-label="Registered" />
                        : <XCircle size={18} color="#DC2626" aria-label="Not registered" />}
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
