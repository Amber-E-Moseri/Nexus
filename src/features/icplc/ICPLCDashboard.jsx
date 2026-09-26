import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import {
  deriveDocumentType, docNeedsAttention,
  RESIDENCY_STATUS_LABELS, DOCUMENT_TYPE_LABELS, DOCUMENT_READINESS_LABELS,
  DOCUMENT_READINESS, DOCUMENT_TYPE, OVERALL_READINESS,
  computeDocReadinessContribution,
} from '../registration/icplcDocReadiness'

// ── Mobile breakpoint hook ───────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(() => {
    const handler = () => setW(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return w
}

// ── Exact prototype colour tokens ────────────────────────────────────────────
const C = {
  purple: '#4C2A92', purpleMid: '#5B35A8', purpleLight: '#7B5CC8', purpleBg: '#F5F2FB',
  green: '#2D8653', greenBg: '#EBF7F1', greenLight: '#D1F0E0',
  red: '#C94830', redBg: '#FEF0ED', redLight: '#FCD6CF',
  orange: '#C97820', orangeBg: '#FEF6E8', orangeLight: '#FDE7BB',
  blue: '#2563EB', blueBg: '#EFF6FF', blueLight: '#DBEAFE',
  grey: '#6B7280', greyBg: '#F3F4F6', greyLight: '#E5E7EB',
  text: '#111827', textSoft: '#6B7280', textMuted: '#9CA3AF',
  border: '#E5E7EB', bg: '#F9FAFB', white: '#FFFFFF',
}

// ── Shared style helpers ─────────────────────────────────────────────────────
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const S = {
  card: { background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '12px 12px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle' },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', background: C.purple, color: C.white, fontFamily: FONT },
  btnSecondary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: `1px solid ${C.border}`, background: C.white, color: C.text, fontFamily: FONT },
  btnGhost: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'transparent', color: C.textSoft, fontFamily: FONT },
}

// ── Badge ────────────────────────────────────────────────────────────────────
const BADGE_STYLES = {
  green:  { background: C.greenBg,  color: C.green  },
  red:    { background: C.redBg,    color: C.red    },
  orange: { background: C.orangeBg, color: C.orange },
  blue:   { background: C.blueBg,   color: C.blue   },
  grey:   { background: C.greyBg,   color: C.textSoft },
  purple: { background: C.purpleBg, color: C.purple },
}

function Badge({ label, variant = 'grey', style: extra }) {
  const s = BADGE_STYLES[variant] || BADGE_STYLES.grey
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', ...s, ...extra }}>
      {label}
    </span>
  )
}

// Participation status → badge variant
const P_STATUS = {
  CONFIRMED:    { label: 'Confirmed',    variant: 'green'  },
  LIKELY:       { label: 'Likely',       variant: 'blue'   },
  UNCERTAIN:    { label: 'Uncertain',    variant: 'orange' },
  TRACKING:     { label: 'Tracking',     variant: 'grey'   },
  NOT_ATTENDING:{ label: 'Not Attending',variant: 'red'    },
}

// Readiness → badge variant
const R_DISPLAY = {
  READY:           { label: 'Ready',           variant: 'green'  },
  IN_PROGRESS:     { label: 'In Progress',     variant: 'blue'   },
  ACTION_REQUIRED: { label: 'Action Required', variant: 'orange' },
  BLOCKED:         { label: 'Blocked',         variant: 'red'    },
  UNKNOWN:         { label: 'Unknown',         variant: 'grey'   },
}

function ParticipationBadge({ value }) {
  const s = P_STATUS[value] || P_STATUS.TRACKING
  return <Badge label={s.label} variant={s.variant} />
}
function ReadinessBadge({ value }) {
  const r = R_DISPLAY[value] || R_DISPLAY.UNKNOWN
  return <Badge label={r.label} variant={r.variant} />
}

// ── Derived helpers ──────────────────────────────────────────────────────────
function deriveRegistrationStatus(p) {
  if (!p._regId) return { label: 'Not Registered', variant: 'grey' }
  return { label: 'Registered', variant: 'green' }
}

function deriveItinerary(p) {
  const has = p.arrivalDate || p.arrivalFlight || p.departureDate || p.departureFlight
  return has ? { label: 'Received', variant: 'green' } : { label: 'Missing', variant: 'red' }
}

function deriveTravelStatusLabel(p) {
  const has = p.arrivalDate || p.arrivalFlight || p.departureDate || p.departureFlight
  return has ? { label: 'Ready', variant: 'green' } : { label: 'Outstanding', variant: 'orange' }
}

function deriveOverallReadiness(r) {
  const docContrib = computeDocReadinessContribution(
    r.canada_residency_status,
    r.canada_status_document_readiness,
  )
  let passContrib = OVERALL_READINESS.UNKNOWN
  if (r.passport_readiness === 'READY' || r.passport_readiness === 'NOT_APPLICABLE') passContrib = OVERALL_READINESS.READY
  else if (r.passport_readiness === 'RENEWAL_NEEDED') passContrib = OVERALL_READINESS.ACTION_REQUIRED
  else if (r.passport_readiness === 'UNSURE') passContrib = OVERALL_READINESS.IN_PROGRESS

  let visaContrib = OVERALL_READINESS.UNKNOWN
  if (!r.visa_requirement || r.visa_requirement === 'NOT_REQUIRED') visaContrib = OVERALL_READINESS.READY
  else if (r.visa_requirement === 'REQUIRED') {
    if (r.visa_process === 'APPROVED') visaContrib = OVERALL_READINESS.READY
    else if (r.visa_process === 'IN_PROGRESS') visaContrib = OVERALL_READINESS.IN_PROGRESS
    else visaContrib = OVERALL_READINESS.ACTION_REQUIRED
  } else if (r.visa_requirement === 'REVIEW') visaContrib = OVERALL_READINESS.ACTION_REQUIRED

  const PREC = ['BLOCKED', 'ACTION_REQUIRED', 'IN_PROGRESS', 'READY', 'UNKNOWN']
  for (const p of PREC) if ([docContrib, passContrib, visaContrib].includes(p)) return p
  return OVERALL_READINESS.UNKNOWN
}

function mergeParticipants(workingList, registrations) {
  const regByEmail = {}
  for (const r of registrations) if (r.email) regByEmail[r.email.toLowerCase()] = r
  return workingList.map(wl => {
    const reg = wl.email ? regByEmail[wl.email.toLowerCase()] : null
    const base = {
      _wlId: wl.id, _regId: reg?.id || null,
      email: wl.email,
      fullName: wl.full_name || [wl.first_name, wl.last_name].filter(Boolean).join(' ') || wl.email || '—',
      firstName: wl.first_name, lastName: wl.last_name,
      gender: wl.gender, subgroup: wl.subgroup, leadership: wl.leadership,
      manuallyConfirmed: wl.manually_confirmed, confirmedAt: wl.confirmed_at, inState: wl.in_state,
      arrivalDate: reg?.arrival_date, arrivalTime: reg?.arrival_time, arrivalFlight: reg?.arrival_flight,
      departureDate: reg?.departure_date, departureTime: reg?.departure_time, departureFlight: reg?.departure_flight,
      canada_residency_status: reg?.canada_residency_status,
      canada_status_document_readiness: reg?.canada_status_document_readiness,
      participation_status: reg?.participation_status || null,
      passport_country: reg?.passport_country,
      passport_readiness: reg?.passport_readiness,
      visa_requirement: reg?.visa_requirement,
      visa_process: reg?.visa_process,
      icplc_tags: reg?.icplc_tags || [],
      operational_note: reg?.operational_note || '',
    }
    return {
      ...base,
      pStatus: base.participation_status || 'TRACKING',
      readiness: deriveOverallReadiness(base),
    }
  })
}

// ── OverviewTab ──────────────────────────────────────────────────────────────
function OverviewTab({ participants, onGoToAttention, isMobile }) {
  const total = participants.length
  const confirmed = participants.filter(p => p.pStatus === 'CONFIRMED').length
  const ready = participants.filter(p => p.readiness === 'READY').length
  const needsAttn = participants.filter(p => {
    if (p.pStatus === 'NOT_ATTENDING') return false
    return p.readiness === 'ACTION_REQUIRED' || p.readiness === 'BLOCKED' || !p._regId
  }).length

  const rCounts = {
    READY: participants.filter(p => p.readiness === 'READY').length,
    ACTION_REQUIRED: participants.filter(p => p.readiness === 'ACTION_REQUIRED').length,
    BLOCKED: participants.filter(p => p.readiness === 'BLOCKED').length,
    UNKNOWN: participants.filter(p => p.readiness === 'UNKNOWN').length,
  }

  const groups = {}
  for (const p of participants) {
    const g = p.subgroup || 'Unassigned'
    if (!groups[g]) groups[g] = []
    groups[g].push(p)
  }

  function StatCard({ label, value, sub, valueColor, barPct, barColor, footer }) {
    return (
      <div style={S.card}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: valueColor || C.text, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, color: C.textSoft, marginTop: 6 }}>{sub}</div>
        {barPct !== undefined && (
          <>
            <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 14, overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', background: barColor || C.green, borderRadius: 2 }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: barColor || C.green, fontWeight: 500 }}>
              {barPct}% {label.toLowerCase()}
            </div>
          </>
        )}
        {footer}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <StatCard label="Confirmed" value={confirmed} sub={`of ${total} tracked participants`}
          barPct={total ? Math.round(confirmed/total*100) : 0} barColor={C.green} />
        <StatCard label="Ready" value={ready} sub="fully ready to travel"
          barPct={total ? Math.round(ready/total*100) : 0} barColor={C.green} />
        <StatCard label="Needs Attention" value={needsAttn} valueColor={needsAttn > 0 ? C.red : C.text}
          sub="require follow-up action"
          barPct={total ? Math.round(needsAttn/total*100) : 0} barColor={C.red}
          footer={needsAttn > 0 && (
            <div style={{ marginTop: 10 }}>
              <button onClick={onGoToAttention} style={{ ...S.btnPrimary, fontSize: 12.5, padding: '6px 14px' }}>View all →</button>
            </div>
          )} />
      </div>

      {total > 0 && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Readiness Distribution</div>
          <div style={{ height: 16, borderRadius: 4, overflow: 'hidden', display: 'flex', margin: '12px 0 10px' }}>
            {[
              { key: 'READY', color: C.green },
              { key: 'ACTION_REQUIRED', color: C.orange },
              { key: 'BLOCKED', color: C.red },
              { key: 'UNKNOWN', color: C.textMuted },
            ].map(({ key, color }) => {
              const pct = total ? rCounts[key] / total * 100 : 0
              return pct > 0 ? <div key={key} style={{ flex: pct, background: color }} title={`${R_DISPLAY[key].label}: ${rCounts[key]}`} /> : null
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {Object.entries(rCounts).map(([key, count]) => count > 0 ? (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.textSoft }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: R_DISPLAY[key]?.variant === 'green' ? C.green : R_DISPLAY[key]?.variant === 'orange' ? C.orange : R_DISPLAY[key]?.variant === 'red' ? C.red : C.textMuted, flexShrink: 0 }} />
                {R_DISPLAY[key]?.label} {count} ({total ? Math.round(count/total*100) : 0}%)
              </div>
            ) : null)}
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>By Subgroup</div>
          <div style={{ fontSize: 12.5, color: C.textSoft }}>Click to filter People</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Subgroup', 'Total', 'Confirmed', 'Registered', 'Ready', 'Confirmed %', 'Issues'].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).sort((a,b) => a[0].localeCompare(b[0])).map(([g, members]) => {
                const conf = members.filter(m => m.pStatus === 'CONFIRMED').length
                const reg = members.filter(m => m._regId).length
                const rdyCount = members.filter(m => m.readiness === 'READY').length
                const issues = members.filter(m => m.readiness === 'ACTION_REQUIRED' || m.readiness === 'BLOCKED' || !m._regId).length
                const confPct = members.length ? Math.round(conf/members.length*100) : 0
                return (
                  <tr key={g}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{g}</td>
                    <td style={S.td}>{members.length}</td>
                    <td style={S.td}>{conf}</td>
                    <td style={S.td}>{reg}</td>
                    <td style={S.td}>{rdyCount}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 5, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${confPct}%`, height: '100%', background: C.green }} />
                        </div>
                        <span style={{ fontSize: 12.5, color: confPct > 0 ? C.text : C.textSoft }}>{confPct}%</span>
                      </div>
                    </td>
                    <td style={S.td}>{issues > 0 ? <Badge label={`${issues} issue${issues !== 1 ? 's' : ''}`} variant={issues >= 2 ? 'red' : 'orange'} /> : '—'}</td>
                  </tr>
                )
              })}
              {Object.keys(groups).length === 0 && (
                <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: C.textMuted, padding: '40px 12px' }}>No participants yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── PeopleTab ────────────────────────────────────────────────────────────────
const PEOPLE_CHIPS = [
  { key: 'all', label: 'All People' },
  { key: 'unregistered', label: 'Unregistered' },
  { key: 'visa', label: 'Visa Action' },
  { key: 'travel', label: 'Travel Outstanding' },
  { key: 'confirmed-not-ready', label: 'Confirmed / Not Ready' },
]

function PeopleTab({ participants, onSelect }) {
  const [chip, setChip] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = participants
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.fullName?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.subgroup?.toLowerCase().includes(q))
    }
    if (chip === 'unregistered') list = list.filter(p => !p._regId)
    if (chip === 'visa') list = list.filter(p => p.visa_requirement === 'REQUIRED' || p.visa_requirement === 'REVIEW')
    if (chip === 'travel') list = list.filter(p => !p.arrivalDate && !p.arrivalFlight && p.pStatus !== 'NOT_ATTENDING')
    if (chip === 'confirmed-not-ready') list = list.filter(p => p.pStatus === 'CONFIRMED' && p.readiness !== 'READY')
    return list
  }, [participants, chip, search])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>People</div>
          <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4 }}>{filtered.length} of {participants.length} people</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {PEOPLE_CHIPS.map(c => (
          <div key={c.key} onClick={() => setChip(c.key)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: `1.5px solid ${chip === c.key ? C.purple : C.border}`, background: chip === c.key ? C.purple : C.white, color: chip === c.key ? C.white : C.textSoft, transition: 'all 0.1s' }}>
            {c.label}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} type="text" placeholder="Search people..."
          style={{ padding: '7px 12px 7px 30px', borderRadius: 6, border: `1px solid ${C.border}`, background: `${C.white} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E") no-repeat 9px center`, fontSize: 13, color: C.text, minWidth: 200, fontFamily: FONT, outline: 'none' }} />
        <button style={S.btnGhost}>☰ Filter</button>
        <button style={S.btnGhost}>↑↓ Sort</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 28 }}><input type="checkbox" /></th>
              <th style={S.th}>Name</th>
              <th style={S.th}>Region / Subgroup</th>
              <th style={S.th}>Leadership</th>
              <th style={S.th}>Participation</th>
              <th style={S.th}>Registration</th>
              <th style={S.th}>Readiness</th>
              <th style={S.th}>Tags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: C.textMuted, padding: '40px 12px' }}>No participants match</td></tr>
            ) : filtered.map(p => {
              const regStatus = deriveRegistrationStatus(p)
              return (
                <tr key={p._wlId || p.email} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => { for (const td of e.currentTarget.cells) td.style.background = '#FAFAFA' }}
                  onMouseLeave={e => { for (const td of e.currentTarget.cells) td.style.background = '' }}>
                  <td style={S.td}><input type="checkbox" /></td>
                  <td style={S.td}>
                    <div onClick={() => onSelect(p)} style={{ fontWeight: 500, cursor: 'pointer', color: C.text }}
                      onMouseEnter={e => e.currentTarget.style.color = C.purple}
                      onMouseLeave={e => e.currentTarget.style.color = C.text}>
                      {p.fullName}
                    </div>
                  </td>
                  <td style={S.td} onClick={() => onSelect(p)}>
                    <div style={{ color: C.text }}>{p.leadership || '—'}</div>
                    <div style={{ color: C.purple, fontSize: 12, cursor: 'pointer', marginTop: 1 }}>{p.subgroup || '—'}</div>
                  </td>
                  <td style={S.td} onClick={() => onSelect(p)}>{p.leadership || 'Member'}</td>
                  <td style={S.td} onClick={() => onSelect(p)}><ParticipationBadge value={p.pStatus} /></td>
                  <td style={S.td} onClick={() => onSelect(p)}><Badge label={regStatus.label} variant={regStatus.variant} /></td>
                  <td style={S.td} onClick={() => onSelect(p)}><ReadinessBadge value={p.readiness} /></td>
                  <td style={S.td} onClick={() => onSelect(p)}>
                    {p.icplc_tags?.map(tag => (
                      <span key={tag} style={{ background: C.greyBg, color: C.textSoft, borderRadius: 12, padding: '2px 8px', fontSize: 11.5, marginRight: 4 }}>{tag}</span>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── BoardTab ─────────────────────────────────────────────────────────────────
const BOARD_COLS = [
  { key: 'TRACKING', label: 'Tracking', dotColor: '#9CA3AF' },
  { key: 'LIKELY', label: 'Likely', dotColor: C.blue },
  { key: 'CONFIRMED', label: 'Confirmed', dotColor: C.green },
  { key: 'UNCERTAIN', label: 'Uncertain', dotColor: C.orange },
  { key: 'NOT_ATTENDING', label: 'Not Attending', dotColor: C.red },
]

function BoardTab({ participants, onSelect }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Board</div>
          <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4 }}>Participation is staff-managed. Clicking a card opens the canonical participant profile.</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select style={{ padding: '7px 28px 7px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, color: C.text, cursor: 'pointer', fontFamily: FONT, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B7280' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
          <option>All subgroups</option>
          {[...new Set(participants.map(p => p.subgroup).filter(Boolean))].map(g => <option key={g}>{g}</option>)}
        </select>
        <select style={{ padding: '7px 28px 7px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, color: C.text, cursor: 'pointer', fontFamily: FONT, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B7280' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
          <option>All tags</option>
          {[...new Set(participants.flatMap(p => p.icplc_tags || []))].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {BOARD_COLS.map(col => {
          const cards = participants.filter(p => p.pStatus === col.key)
          return (
            <div key={col.key} style={{ minWidth: 220, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: col.dotColor, flexShrink: 0 }} />
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{col.label}</div>
                <div style={{ marginLeft: 'auto', background: C.greyBg, color: C.textSoft, fontSize: 12, fontWeight: 600, padding: '1px 7px', borderRadius: 10 }}>{cards.length}</div>
              </div>
              {cards.map(p => (
                <div key={p._wlId || p.email} onClick={() => onSelect(p)}
                  style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', transition: 'box-shadow 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.10)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 3 }}>{p.fullName}</div>
                  <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 8 }}>{p.subgroup || '—'}</div>
                  <ReadinessBadge value={p.readiness} />
                  {p.icplc_tags?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {p.icplc_tags.map(t => <span key={t} style={{ background: C.greyBg, color: C.textSoft, borderRadius: 12, padding: '2px 7px', fontSize: 11, marginRight: 4 }}>{t}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── DocumentationTab ─────────────────────────────────────────────────────────
function DocumentationTab({ participants, onSelect, isMobile }) {
  const [search, setSearch] = useState('')
  const filtered = search ? participants.filter(p => p.fullName?.toLowerCase().includes(search.toLowerCase()) || p.subgroup?.toLowerCase().includes(search.toLowerCase())) : participants

  const PASSPORT_LABELS = { READY: 'Ready', UNSURE: 'Unsure', RENEWAL_NEEDED: 'Renewal Needed', NOT_APPLICABLE: 'Not Applicable' }
  const PASSPORT_VARIANTS = { READY: 'green', UNSURE: 'orange', RENEWAL_NEEDED: 'orange', NOT_APPLICABLE: 'grey' }
  const VISA_REQ_LABELS = { NOT_REQUIRED: 'Not Required', REQUIRED: 'Required', REVIEW: 'Review' }
  const VISA_REQ_VARIANTS = { NOT_REQUIRED: 'green', REQUIRED: 'red', REVIEW: 'orange' }
  const VISA_PROC_LABELS = { NOT_APPLICABLE: 'Not Applicable', NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', APPROVED: 'Approved' }
  const VISA_PROC_VARIANTS = { NOT_APPLICABLE: 'grey', NOT_STARTED: 'grey', IN_PROGRESS: 'blue', APPROVED: 'green' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Documentation</div>
          <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4 }}>Operational passport, Canadian status, and visa readiness</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ border: '1px solid #93C5FD', borderRadius: 8, padding: '14px 16px', background: C.blueBg }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.blue, marginBottom: 6 }}>Canadian Status</div>
          <p style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.5 }}>Immigration status determines the required document — PR Card, Study Permit, Work Permit, etc.</p>
        </div>
        <div style={{ border: '1px solid #86EFAC', borderRadius: 8, padding: '14px 16px', background: C.greenBg }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.green, marginBottom: 6 }}>Passport</div>
          <p style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.5 }}>Travel document tracked separately from Canadian status — country and readiness status.</p>
        </div>
        <div style={{ border: '1px solid #FCD34D', borderRadius: 8, padding: '14px 16px', background: C.orangeBg }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B45309', marginBottom: 6 }}>Destination Entry</div>
          <p style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.5 }}>Visa or entry requirement for the conference destination — determined by passport country.</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} type="text" placeholder="Search..."
          style={{ padding: '7px 12px 7px 30px', borderRadius: 6, border: `1px solid ${C.border}`, background: `${C.white} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E") no-repeat 9px center`, fontSize: 13, fontFamily: FONT, outline: 'none' }} />
        <span style={{ fontSize: 13, color: C.textSoft, marginLeft: 'auto' }}>{filtered.length} of {participants.length}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Canadian Status', 'Required Document', 'Passport', 'Passport Readiness', 'Visa Requirement', 'Visa Process'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: C.textMuted, padding: '40px 12px' }}>No participants</td></tr>
            ) : filtered.map(p => {
              const docType = deriveDocumentType(p.canada_residency_status)
              return (
                <tr key={p._wlId || p.email} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => { for (const td of e.currentTarget.cells) td.style.background = '#FAFAFA' }}
                  onMouseLeave={e => { for (const td of e.currentTarget.cells) td.style.background = '' }}>
                  <td style={S.td} onClick={() => onSelect(p, 'documentation')}>
                    <div style={{ fontWeight: 500, color: C.text }}
                      onMouseEnter={e => e.currentTarget.style.color = C.purple}
                      onMouseLeave={e => e.currentTarget.style.color = C.text}>{p.fullName}</div>
                  </td>
                  <td style={S.td}>{RESIDENCY_STATUS_LABELS[p.canada_residency_status] || '—'}</td>
                  <td style={{ ...S.td, color: C.textSoft }}>{DOCUMENT_TYPE_LABELS[docType] || '—'}</td>
                  <td style={S.td}>{p.passport_country || '—'}</td>
                  <td style={S.td}>{p.passport_readiness ? <Badge label={PASSPORT_LABELS[p.passport_readiness] || p.passport_readiness} variant={PASSPORT_VARIANTS[p.passport_readiness] || 'grey'} /> : '—'}</td>
                  <td style={S.td}>{p.visa_requirement ? <Badge label={VISA_REQ_LABELS[p.visa_requirement] || p.visa_requirement} variant={VISA_REQ_VARIANTS[p.visa_requirement] || 'grey'} /> : '—'}</td>
                  <td style={S.td}>{p.visa_process ? <Badge label={VISA_PROC_LABELS[p.visa_process] || p.visa_process} variant={VISA_PROC_VARIANTS[p.visa_process] || 'grey'} /> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── TravelTab ────────────────────────────────────────────────────────────────
function TravelTab({ participants, onSelect }) {
  const [search, setSearch] = useState('')
  const filtered = search ? participants.filter(p => p.fullName?.toLowerCase().includes(search.toLowerCase())) : participants

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Travel</div>
          <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4 }}>Flight and itinerary tracking</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} type="text" placeholder="Search..."
          style={{ padding: '7px 12px 7px 30px', borderRadius: 6, border: `1px solid ${C.border}`, background: `${C.white} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E") no-repeat 9px center`, fontSize: 13, fontFamily: FONT, outline: 'none' }} />
        <span style={{ fontSize: 13, color: C.textSoft, marginLeft: 'auto' }}>{filtered.length} of {participants.length}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Itinerary', 'Arrival', 'Arrival Flight', 'Departure', 'Dep. Flight', 'Status'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const itinerary = deriveItinerary(p)
              const status = deriveTravelStatusLabel(p)
              function fmtDate(d) { if (!d) return ''; try { return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) } catch { return d } }
              return (
                <tr key={p._wlId || p.email} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => { for (const td of e.currentTarget.cells) td.style.background = '#FAFAFA' }}
                  onMouseLeave={e => { for (const td of e.currentTarget.cells) td.style.background = '' }}
                  onClick={() => onSelect(p, 'travel')}>
                  <td style={S.td}><div style={{ fontWeight: 500 }}>{p.fullName}</div></td>
                  <td style={S.td}><Badge label={itinerary.label} variant={itinerary.variant} /></td>
                  <td style={{ ...S.td, color: p.arrivalDate ? C.text : C.textMuted }}>{fmtDate(p.arrivalDate) || '—'}</td>
                  <td style={{ ...S.td, color: p.arrivalFlight ? C.text : C.textMuted }}>{p.arrivalFlight || '—'}</td>
                  <td style={{ ...S.td, color: p.departureDate ? C.text : C.textMuted }}>{fmtDate(p.departureDate) || '—'}</td>
                  <td style={{ ...S.td, color: p.departureFlight ? C.text : C.textMuted }}>{p.departureFlight || '—'}</td>
                  <td style={S.td}><Badge label={status.label} variant={status.variant} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── NeedsAttentionTab ────────────────────────────────────────────────────────
function NeedsAttentionTab({ participants, onSelect }) {
  const active = participants.filter(p => p.pStatus !== 'NOT_ATTENDING')

  const groups = [
    {
      title: 'Blocked',
      desc: 'Hard blocker — prevents travel clearance',
      borderColor: C.red,
      items: active.filter(p => p.readiness === 'BLOCKED'),
    },
    {
      title: 'Visa Required — Not Started',
      desc: 'Visa required but process not yet started',
      borderColor: C.orange,
      items: active.filter(p => p.visa_requirement === 'REQUIRED' && (!p.visa_process || p.visa_process === 'NOT_STARTED')),
    },
    {
      title: 'Registration Outstanding',
      desc: 'Not registered or registration has an issue',
      borderColor: C.orange,
      items: active.filter(p => !p._regId),
    },
    {
      title: 'Confirmed — Itinerary Missing',
      desc: 'Confirmed attendance but no flight details on file',
      borderColor: C.blue,
      items: active.filter(p => p.pStatus === 'CONFIRMED' && !p.arrivalDate && !p.arrivalFlight),
    },
    {
      title: 'Canadian Status Unknown',
      desc: 'Residency status not yet entered',
      borderColor: C.orange,
      items: active.filter(p => !p.canada_residency_status),
    },
  ].filter(g => g.items.length > 0)

  if (groups.length === 0) {
    return (
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Needs Attention</div>
        <div style={{ fontSize: 12.5, color: C.textSoft, marginBottom: 24 }}>Derived from participant records — click any row to open their profile.</div>
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.textMuted }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>All clear</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>No action items found for active participants.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Needs Attention</div>
          <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4 }}>Derived from participant records — click any row to open their profile.</div>
        </div>
      </div>

      {groups.map(g => (
        <div key={g.title} style={{ marginBottom: 24 }}>
          <div style={{ borderLeft: `3px solid ${g.borderColor}`, paddingLeft: 12, marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{g.title}</div>
              <div style={{ fontSize: 13, color: C.textSoft }}>{g.items.length}</div>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{g.desc}</div>
          </div>
          <div style={{ marginTop: 10, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Participant', 'Subgroup', 'Participation', 'Readiness', ''].map(h => <th key={h} style={{ ...S.th, background: '#FAFAFA' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {g.items.map(p => (
                  <tr key={p._wlId || p.email}
                    onMouseEnter={e => { for (const td of e.currentTarget.cells) td.style.background = '#FAFAFA' }}
                    onMouseLeave={e => { for (const td of e.currentTarget.cells) td.style.background = '' }}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{p.fullName}</td>
                    <td style={S.td}>{p.subgroup || '—'}</td>
                    <td style={S.td}><ParticipationBadge value={p.pStatus} /></td>
                    <td style={S.td}><ReadinessBadge value={p.readiness} /></td>
                    <td style={S.td}>
                      <span onClick={() => onSelect(p)}
                        style={{ color: C.purple, fontSize: 12, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
                        View profile →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── ImportsTab ───────────────────────────────────────────────────────────────
function ImportsTab() {
  const [step, setStep] = useState(0) // 0=upload, 1=preview, ...
  const STEPS = ['1 · Upload', '2 · Preview', '3 · Match', '4 · Compare', '5 · Apply']

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Imports</div>
          <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4 }}>Registration CSV review — source data cannot overwrite protected Nexus corrections</div>
        </div>
        <button style={S.btnPrimary}>+ New Import</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, textAlign: 'center', padding: '12px 8px', fontSize: 12.5, cursor: 'pointer', borderBottom: `2px solid ${i === step ? C.purple : 'transparent'}`, color: i < step ? C.green : i === step ? C.purple : C.textMuted, fontWeight: i === step ? 500 : 400, marginBottom: -1, transition: 'all 0.1s' }}>
            {i < step ? '✓ ' + s : s}
          </div>
        ))}
      </div>

      <div style={S.card}>
        {step === 0 ? (
          <div onClick={() => setStep(1)}
            style={{ border: `2px dashed ${C.border}`, borderRadius: 8, padding: '60px 24px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.purpleLight}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: C.purpleBg, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>↑</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Upload Registration CSV</div>
            <div style={{ color: C.textSoft, fontSize: 13, marginBottom: 16 }}>Select a CSV export to begin a reviewed import.</div>
            <button style={{ ...S.btnPrimary, margin: '0 auto' }}>Choose sample CSV</button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: C.greenBg, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: C.green }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.green, marginBottom: 6 }}>sample_registration.csv uploaded</div>
            <div style={{ color: C.textSoft, fontSize: 13, marginBottom: 16 }}>Rows detected · Proceed to preview</div>
            <button style={{ ...S.btnPrimary, margin: '0 auto' }}>Preview rows →</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SettingsTab ──────────────────────────────────────────────────────────────
function SettingsTab({ eventConfig, isMobile }) {
  const tags = ['Finances', 'School', 'Parental/Family', 'Work', 'Travel Cost', 'Needs Follow-up']
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Settings</div>
        <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4 }}>ICPLC operational configuration</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
        {/* Tags */}
        <div style={S.card}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 14 }}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {tags.map(t => <div key={t} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12.5, background: C.greyBg, color: C.text, border: `1px solid ${C.border}` }}>{t}</div>)}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: C.purple, cursor: 'pointer' }}>+ Add tag</div>
        </div>

        {/* Visa Country Defaults */}
        <div style={S.card}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 14 }}>Visa Country Defaults</div>
          {[['Nigeria', C.red, 'Required'], ['Ghana', C.orange, 'Review'], ['Canada', C.green, 'Not Required']].map(([country, color, status]) => (
            <div key={country} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 }}>
              <span>{country}</span><span style={{ color, fontWeight: 500 }}>{status}</span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}><button style={{ ...S.btnSecondary, fontSize: 12.5, padding: '6px 12px' }}>Manage defaults</button></div>
        </div>

        {/* Deadlines */}
        <div style={S.card}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 14 }}>Deadlines</div>
          {['Registration deadline', 'Visa target', 'Flight deadline'].map(label => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', fontSize: 13.5, color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>
              <span>{label}</span><span style={{ color: C.textMuted, fontStyle: 'italic' }}>Not configured</span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}><button style={{ ...S.btnSecondary, fontSize: 12.5, padding: '6px 12px' }}>Configure deadlines</button></div>
        </div>

        {/* Integrations */}
        <div style={S.card}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 14 }}>Integrations</div>
          {[['Registration CSV', C.green, 'Ready'], ['CMP sync', C.textMuted, 'Not configured']].map(([label, color, val]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', fontSize: 13.5, borderBottom: `1px solid ${C.border}` }}>
              <span>{label}</span><span style={{ color, fontWeight: 500 }}>{val}</span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}><button style={{ ...S.btnSecondary, fontSize: 12.5, padding: '6px 12px' }}>Configure</button></div>
        </div>
      </div>
    </div>
  )
}

// ── ParticipantPanel ─────────────────────────────────────────────────────────
const PANEL_TABS = ['Overview', 'Registration', 'Documentation', 'Travel', 'Notes & Activity']

function ParticipantPanel({ participant: p, onClose, onUpdate, canEdit }) {
  const [panelTab, setPanelTab] = useState('Overview')
  const [noteValue, setNoteValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNoteValue(p?.operational_note || '')
    setPanelTab('Overview')
  }, [p?._wlId])

  // Allow opening directly to a specific tab
  function openToTab(tab) { setPanelTab(tab) }

  const regStatus = deriveRegistrationStatus(p)
  const readinessInfo = R_DISPLAY[p.readiness] || R_DISPLAY.UNKNOWN
  const pInfo = P_STATUS[p.pStatus] || P_STATUS.TRACKING

  const itinerary = deriveItinerary(p)
  const travelStatus = deriveTravelStatusLabel(p)
  const docType = deriveDocumentType(p.canada_residency_status)

  const docSummary = `Passport: ${p.passport_readiness ? { READY: 'Ready', UNSURE: 'Unsure', RENEWAL_NEEDED: 'Renewal Needed', NOT_APPLICABLE: 'N/A' }[p.passport_readiness] : '—'} · Visa: ${p.visa_requirement ? { NOT_REQUIRED: 'Not Required', REQUIRED: 'Required', REVIEW: 'Review' }[p.visa_requirement] : '—'}`
  const travelSummary = `Itinerary: ${itinerary.label} · Status: ${travelStatus.label}`

  const issues = []
  const docAttn = docNeedsAttention({ canadaResidencyStatus: p.canada_residency_status, canadaStatusDocumentReadiness: p.canada_status_document_readiness })
  if (docAttn) issues.push(docAttn)
  if (p.visa_requirement === 'REQUIRED' && (!p.visa_process || p.visa_process === 'NOT_STARTED')) issues.push('Visa required but application not yet started.')
  if (p.passport_readiness === 'RENEWAL_NEEDED') issues.push('Passport renewal required.')
  if (!p._regId) issues.push('Registration outstanding.')
  const currentIssue = issues.join(' ')

  async function saveNote() {
    if (!p._regId) return
    setSaving(true)
    await supabase.from('registrations').update({ operational_note: noteValue }).eq('id', p._regId)
    onUpdate({ ...p, operational_note: noteValue })
    setSaving(false)
  }

  async function saveParticipationStatus(val) {
    if (!p._regId) return
    await supabase.from('registrations').update({ participation_status: val }).eq('id', p._regId)
    onUpdate({ ...p, participation_status: val, pStatus: val })
  }

  const PASSPORT_LABELS = { READY: 'Ready', UNSURE: 'Unsure', RENEWAL_NEEDED: 'Renewal Needed', NOT_APPLICABLE: 'Not Applicable' }
  const PASSPORT_VARIANTS = { READY: 'green', UNSURE: 'orange', RENEWAL_NEEDED: 'orange', NOT_APPLICABLE: 'grey' }
  const VISA_REQ_LABELS = { NOT_REQUIRED: 'Not Required', REQUIRED: 'Required', REVIEW: 'Review' }
  const VISA_REQ_VARIANTS = { NOT_REQUIRED: 'green', REQUIRED: 'red', REVIEW: 'orange' }
  const VISA_PROC_LABELS = { NOT_APPLICABLE: 'Not Applicable', NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', APPROVED: 'Approved' }
  const VISA_PROC_VARIANTS = { NOT_APPLICABLE: 'grey', NOT_STARTED: 'grey', IN_PROGRESS: 'blue', APPROVED: 'green' }

  function fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) } catch { return d } }

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100vw' : 400, background: C.white, boxShadow: '-4px 0 24px rgba(0,0,0,.12)', zIndex: 200, display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', borderBottom: `1px solid ${C.border}`, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: '50%', background: C.greyBg, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: C.textSoft, fontFamily: FONT }}>✕</button>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{p.fullName}</div>
        <div style={{ fontSize: 12.5, color: C.textSoft, marginBottom: 10 }}>{p.subgroup || 'No subgroup'} · {p.leadership || 'Member'}</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <ParticipationBadge value={p.pStatus} />
          <Badge label={regStatus.label} variant={regStatus.variant} />
          <ReadinessBadge value={p.readiness} />
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {PANEL_TABS.map(t => (
            <div key={t} onClick={() => setPanelTab(t)} style={{ padding: '8px 14px', fontSize: 12.5, cursor: 'pointer', borderBottom: `2px solid ${panelTab === t ? C.purple : 'transparent'}`, color: panelTab === t ? C.purple : C.textSoft, fontWeight: panelTab === t ? 500 : 400, whiteSpace: 'nowrap', marginBottom: -1 }}>
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

        {panelTab === 'Overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ background: C.greyBg, borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4 }}>Organization</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.leadership || 'Member'}</div>
                <div style={{ fontSize: 12, color: C.textSoft }}>{p.subgroup || '—'}</div>
              </div>
              <div style={{ background: C.greyBg, borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4 }}>Current State</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
                  <ParticipationBadge value={p.pStatus} />
                  <Badge label={regStatus.label} variant={regStatus.variant} style={{ fontSize: 11.5 }} />
                  <ReadinessBadge value={p.readiness} />
                </div>
              </div>
            </div>

            {p.icplc_tags?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4 }}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                  {p.icplc_tags.map(t => <span key={t} style={{ background: C.greyBg, color: C.textSoft, borderRadius: 12, padding: '2px 8px', fontSize: 11.5 }}>{t}</span>)}
                </div>
              </div>
            )}

            {currentIssue && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4 }}>Current Issue</div>
                <div style={{ background: C.redBg, borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#922015' }}>{currentIssue}</div>
              </div>
            )}

            {canEdit && p._regId && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 6 }}>Set Participation</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {Object.entries(P_STATUS).map(([k, v]) => (
                    <div key={k} onClick={() => saveParticipationStatus(k)}
                      style={{ padding: '4px 10px', borderRadius: 16, border: `1.5px solid ${p.pStatus === k ? (BADGE_STYLES[v.variant]?.color || C.grey) : C.border}`, background: p.pStatus === k ? BADGE_STYLES[v.variant]?.background : C.white, color: p.pStatus === k ? BADGE_STYLES[v.variant]?.color : C.textSoft, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      {v.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4 }}>Documentation</div>
              <div style={{ fontSize: 13, color: C.text }}>{docSummary}</div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4 }}>Travel</div>
              <div style={{ fontSize: 13, color: C.text }}>{travelSummary}</div>
            </div>
          </div>
        )}

        {panelTab === 'Registration' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textSoft, marginBottom: 10 }}>Registration Source &amp; Precedence</div>
            {[
              { label: 'Registration', nexus: regStatus.label, source: regStatus.label, auth: p._regId ? 'Registration CSV' : 'Not set' },
              { label: 'Participation', nexus: P_STATUS[p.pStatus]?.label || 'Unknown', source: P_STATUS[p.participation_status || 'TRACKING']?.label || 'Unknown', auth: p._regId ? 'Registration CSV' : 'Manual', isOverride: !!p.manuallyConfirmed },
            ].map(row => (
              <div key={row.label} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 10 }}>{row.label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[['Nexus value', row.nexus, false], ['Latest source', row.source, false], ['Authority', row.auth, row.isOverride]].map(([lbl, val, isPurple]) => (
                    <div key={lbl} style={{ background: C.greyBg, borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: C.textSoft, marginBottom: 3 }}>{lbl}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isPurple ? C.purple : C.text }}>{val}</div>
                    </div>
                  ))}
                </div>
                {row.isOverride && (
                  <div style={{ background: C.orangeBg, border: `1px solid ${C.orangeLight}`, borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#7C4A00', marginTop: 8 }}>
                    Manual protection is active. A re-import will not overwrite this field.
                    <span style={{ color: C.orange, cursor: 'pointer', fontWeight: 500, display: 'block', marginTop: 4 }}>Resume source sync</span>
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4, fontWeight: 600 }}>Last Synchronized</div>
              <div style={{ fontSize: 13 }}>{p._regId ? 'On file · Registration CSV' : 'Never — no registration record'}</div>
            </div>
          </div>
        )}

        {panelTab === 'Documentation' && (
          <div>
            <div style={{ border: '1px solid #93C5FD', background: C.blueBg, borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.blue, marginBottom: 12 }}>Canadian Status</div>
              <PanelField label="Status" value={RESIDENCY_STATUS_LABELS[p.canada_residency_status] || '—'} />
              <PanelField label="Required Document" value={DOCUMENT_TYPE_LABELS[docType] || '—'} last />
            </div>
            <div style={{ border: '1px solid #86EFAC', background: C.greenBg, borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.green, marginBottom: 12 }}>Passport</div>
              <PanelField label="Country" value={p.passport_country || '—'} />
              <div style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 3 }}>Readiness</div>
                {p.passport_readiness ? <Badge label={PASSPORT_LABELS[p.passport_readiness]} variant={PASSPORT_VARIANTS[p.passport_readiness]} /> : <span style={{ fontSize: 14, fontWeight: 500 }}>—</span>}
              </div>
            </div>
            <div style={{ border: '1px solid #FCD34D', background: C.orangeBg, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B45309', marginBottom: 12 }}>Destination Entry Requirement</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 3 }}>Visa Requirement</div>
                {p.visa_requirement ? <Badge label={VISA_REQ_LABELS[p.visa_requirement]} variant={VISA_REQ_VARIANTS[p.visa_requirement]} /> : <span style={{ fontSize: 14, fontWeight: 500 }}>—</span>}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 3 }}>Visa Process</div>
                {p.visa_process ? <Badge label={VISA_PROC_LABELS[p.visa_process]} variant={VISA_PROC_VARIANTS[p.visa_process]} /> : <span style={{ fontSize: 14, fontWeight: 500 }}>—</span>}
              </div>
            </div>
          </div>
        )}

        {panelTab === 'Travel' && (
          <div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4 }}>Itinerary</div>
              <div style={{ marginTop: 4 }}><Badge label={itinerary.label} variant={itinerary.variant} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4 }}>Arrival Date</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{fmtDate(p.arrivalDate)}</div>
                <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4 }}>{p.arrivalFlight || '—'}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 4 }}>Departure Date</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{fmtDate(p.departureDate)}</div>
                <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4 }}>{p.departureFlight || '—'}</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 6 }}>Travel Status</div>
              <Badge label={travelStatus.label} variant={travelStatus.variant} />
            </div>
          </div>
        )}

        {panelTab === 'Notes & Activity' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 8 }}>Operational Note</div>
            <textarea value={noteValue} onChange={e => setNoteValue(e.target.value)} disabled={!canEdit || !p._regId}
              placeholder="Add an operational note..."
              style={{ width: '100%', minHeight: 100, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13.5, resize: 'vertical', fontFamily: FONT, marginBottom: 10, outline: 'none', boxSizing: 'border-box', background: canEdit ? C.white : C.greyBg }} />
            {canEdit && p._regId && (
              <button onClick={saveNote} disabled={saving} style={{ ...S.btnSecondary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save note'}</button>
            )}
            {!p._regId && (
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>No registration record — notes unavailable until participant is registered.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PanelField({ label, value, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'people', label: 'People' },
  { key: 'board', label: 'Board' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'travel', label: 'Travel' },
  { key: 'attention', label: 'Needs Attention' },
  { key: 'imports', label: 'Imports' },
  { key: 'settings', label: 'Settings' },
]

export default function ICPLCDashboard({ eventConfig, canAccess, sprintEditAccess, financeAccess }) {
  const { profile, role } = useAuth()
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedParticipant, setSelectedParticipant] = useState(null)
  const [selectedPanelTab, setSelectedPanelTab] = useState('Overview')
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 768

  const canEdit = sprintEditAccess && canAccess !== false
  const eventId = eventConfig?.id

  const loadData = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    const [wlRes, regRes] = await Promise.all([
      supabase.from('working_list').select('*').eq('event_config_id', eventId).order('subgroup'),
      supabase.from('registrations').select('*').eq('event_config_id', eventId),
    ])
    if (!wlRes.error && !regRes.error) {
      setParticipants(mergeParticipants(wlRes.data || [], regRes.data || []))
    }
    setLoading(false)
  }, [eventId])

  useEffect(() => { loadData() }, [loadData])

  function handleSelect(p, tab) {
    setSelectedParticipant(p)
    if (tab) setSelectedPanelTab(tab)
  }

  function handleUpdate(updated) {
    const refreshed = { ...updated, pStatus: updated.participation_status || 'TRACKING', readiness: deriveOverallReadiness(updated) }
    setParticipants(prev => prev.map(p => p._wlId === updated._wlId ? refreshed : p))
    setSelectedParticipant(refreshed)
  }

  const attentionCount = useMemo(() => participants.filter(p => {
    if (p.pStatus === 'NOT_ATTENDING') return false
    return p.readiness === 'ACTION_REQUIRED' || p.readiness === 'BLOCKED' || !p._regId ||
      (p.pStatus === 'CONFIRMED' && !p.arrivalDate && !p.arrivalFlight)
  }).length, [participants])

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, fontSize: 14, color: C.text }}>
      {/* Page header */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '14px 16px 0' : '20px 24px 0', margin: isMobile ? '0 -16px' : '0 -26px', paddingLeft: isMobile ? 16 : 24, paddingRight: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: isMobile ? 'wrap' : 'nowrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: isMobile ? 36 : 48, height: isMobile ? 36 : 48, borderRadius: 10, background: C.purple, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 17 : 22, flexShrink: 0 }}>✦</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? 17 : 22, fontWeight: 700, color: C.text }}>ICPLC</div>
              <div style={{ fontSize: 12, color: C.textSoft, marginTop: 2, whiteSpace: isMobile ? 'normal' : 'nowrap' }}>International Campus Pastors and Leaders Conference · Nov 26</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button style={{ ...S.btnSecondary, fontSize: 12, padding: '6px 10px' }}>↓ Export</button>
            {canEdit && <button style={{ ...S.btnPrimary, fontSize: 12, padding: '6px 10px' }}>+ Add</button>}
          </div>
        </div>

        {/* Tab bar — scrollable on mobile */}
        <div style={{ display: 'flex', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', marginLeft: isMobile ? -16 : -24, marginRight: isMobile ? -16 : -24, paddingLeft: isMobile ? 16 : 24 }}>
          {TABS.map(t => (
            <div key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding: isMobile ? '9px 12px' : '10px 16px', fontSize: isMobile ? 12.5 : 13.5, cursor: 'pointer', borderBottom: `2px solid ${activeTab === t.key ? C.purple : 'transparent'}`, color: activeTab === t.key ? C.purple : C.textSoft, fontWeight: activeTab === t.key ? 500 : 400, whiteSpace: 'nowrap', transition: 'color 0.1s', marginBottom: -1, userSelect: 'none', flexShrink: 0 }}>
              {t.label}
              {t.key === 'attention' && attentionCount > 0 && (
                <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 8, background: C.red, color: C.white }}>{attentionCount}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: isMobile ? '16px 0' : 24 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: C.textMuted, fontSize: 14 }}>Loading participants…</div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab participants={participants} onGoToAttention={() => setActiveTab('attention')} isMobile={isMobile} />}
            {activeTab === 'people' && <PeopleTab participants={participants} onSelect={(p) => handleSelect(p)} />}
            {activeTab === 'board' && <BoardTab participants={participants} onSelect={(p) => handleSelect(p)} />}
            {activeTab === 'documentation' && <DocumentationTab participants={participants} onSelect={(p, tab) => handleSelect(p, tab ? 'Documentation' : 'Overview')} isMobile={isMobile} />}
            {activeTab === 'travel' && <TravelTab participants={participants} onSelect={(p) => handleSelect(p, 'Travel')} />}
            {activeTab === 'attention' && <NeedsAttentionTab participants={participants} onSelect={(p) => handleSelect(p)} />}
            {activeTab === 'imports' && <ImportsTab />}
            {activeTab === 'settings' && <SettingsTab eventConfig={eventConfig} isMobile={isMobile} />}
          </>
        )}
      </div>

      {/* Slide panel overlay */}
      {selectedParticipant && (
        <div onClick={() => setSelectedParticipant(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 199, opacity: 1, pointerEvents: 'auto' }} />
      )}
      {selectedParticipant && (
        <ParticipantPanel
          participant={selectedParticipant}
          onClose={() => setSelectedParticipant(null)}
          onUpdate={handleUpdate}
          canEdit={canEdit}
        />
      )}
    </div>
  )
}
