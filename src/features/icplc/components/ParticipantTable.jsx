import React, { useState, useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import ReadinessChip from './ReadinessChip.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import { deriveReadiness } from '../lib/readinessEngine.js'

const PARTICIPATION_TONES = {
  tracking: 'mute', likely: 'in_progress', confirmed: 'done',
  uncertain: 'at_risk', not_attending: 'blocked',
}

const REGISTRATION_TONES = {
  registered: 'done', not_registered: 'at_risk', issue: 'blocked', unknown: 'mute',
}

export default function ParticipantTable({ participants, loading }) {
  const { openProfile, filters } = useICPLC()
  const [sortField, setSortField] = useState('full_name')
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(field) {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Client-side readiness filter (derived, not from DB)
  const filtered = useMemo(() => {
    let rows = participants || []
    if (filters.readiness?.length > 0) {
      rows = rows.filter((p) => {
        const { readiness } = deriveReadiness(p)
        return filters.readiness.includes(readiness)
      })
    }
    if (filters.tags?.length > 0) {
      rows = rows.filter((p) =>
        p.tags?.some((t) => filters.tags.includes(t.name))
      )
    }
    return rows
  }, [participants, filters.readiness, filters.tags])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = a[sortField] ?? ''
      let vb = b[sortField] ?? ''
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortField, sortDir])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading participants…</div>
  }

  if (!sorted.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No participants match current filters.</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="fs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortTh field="full_name" label="Name" active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="region" label="Region" active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="subgroup" label="Subgroup" active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="participation_status" label="Participation" active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="registration_status" label="Registration" active={sortField} dir={sortDir} onClick={handleSort} />
            <th style={thStyle}>Readiness</th>
            <SortTh field="passport_readiness" label="Passport" active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="visa_requirement" label="Visa" active={sortField} dir={sortDir} onClick={handleSort} />
            <th style={thStyle}>Tags</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const registrationStatus = p.registration_link_status || p.registration_status
            return (
              <tr
                key={p.id}
                onClick={() => openProfile(p.id)}
                style={{ cursor: 'pointer' }}
              >
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{p.full_name}</div>
                  {p.email && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.email}</div>}
                </td>
                <td style={tdStyle}>{p.region || '-'}</td>
                <td style={tdStyle}>{p.subgroup || '-'}</td>
                <td style={tdStyle}>
                  <Badge
                    tone={PARTICIPATION_TONES[p.participation_status] || 'mute'}
                    label={p.participation_status}
                  />
                </td>
                <td style={tdStyle}>
                  <Badge
                    tone={REGISTRATION_TONES[registrationStatus] || 'mute'}
                    label={registrationStatus}
                  />
                </td>
                <td style={tdStyle}>
                  <ReadinessChip participant={p} />
                </td>
                <td style={tdStyle}><span style={{ fontSize: 12 }}>{p.passport_readiness}</span></td>
                <td style={tdStyle}><span style={{ fontSize: 12 }}>{p.visa_requirement}</span></td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {p.tags?.map((t) => (
                      <span
                        key={t.id}
                        className="fchip"
                        style={{ fontSize: 11, background: t.color || 'var(--surface-2)' }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SortTh({ field, label, active, dir, onClick }) {
  const isActive = active === field
  return (
    <th
      style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onClick(field)}
    >
      {label}
      {isActive && <span style={{ marginLeft: 4, fontSize: 10 }}>{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const tdStyle = {
  padding: '10px 12px', borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
}
