import { useMemo } from 'react'
import { GROUP_COLORS, HUBS, haversineKm } from './data/hubs'
import { STATUS, STATUS_ORDER, NEEDS_PLAN_COLOR, isReached } from './data/status'

const GROUPS = Object.keys(GROUP_COLORS)
const OPPORTUNITY_RADIUS_KM = 10
const MAX_OPPORTUNITIES_PER_GROUP = 5

// Text color over a status segment — amber needs dark ink
function labelInk(color) {
  return color === STATUS['Pioneering Fellowship'].color ? '#5a3e00' : '#fff'
}

function displayName(c) {
  if (c.institution && c.institution !== c.campus) return `${c.institution} — ${c.campus}`
  return c.campus || c.institution || 'Unknown'
}

// For each not-yet-reached campus, find the nearest already-reached campus
// within OPPORTUNITY_RADIUS_KM — momentum to build on rather than starting cold.
function computeOpportunities(campuses) {
  return GROUPS.map((g) => {
    const all = campuses.filter((c) => c.lat && c.lng && c.group === g)
    const reached = all.filter((c) => isReached(c.status))
    const unreached = all.filter((c) => !isReached(c.status))

    const matches = []
    for (const target of unreached) {
      let nearest = null
      for (const anchor of reached) {
        const d = haversineKm(target.lat, target.lng, anchor.lat, anchor.lng)
        if (d <= OPPORTUNITY_RADIUS_KM && (!nearest || d < nearest.distanceKm)) {
          nearest = { anchor, distanceKm: d }
        }
      }
      if (nearest) matches.push({ target, anchor: nearest.anchor, distanceKm: nearest.distanceKm })
    }
    matches.sort((a, b) => a.distanceKm - b.distanceKm)

    return { group: g, total: matches.length, top: matches.slice(0, MAX_OPPORTUNITIES_PER_GROUP) }
  })
}

function computeGroupStats(campuses) {
  return GROUPS.map((g) => {
    const all = campuses.filter((c) => c.lat && c.lng && c.group === g)
    const tot = all.length
    const counts = {}
    STATUS_ORDER.forEach((s) => { counts[s] = all.filter((c) => c.status === s).length })
    const reached = all.filter((c) => isReached(c.status)).length
    const pct = tot ? Math.round((reached / tot) * 100) : 0
    const np = all.filter((c) => c.needs_plan).length

    // Top 5 hubs by campus count within this group
    const groupHubNames = Object.entries(HUBS)
      .filter(([, h]) => h.group === g)
      .map(([name]) => name)
    const hubCounts = groupHubNames
      .map((name) => ({ name, count: all.filter((c) => c.nearestHubName === name).length }))
      .filter((h) => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return { group: g, tot, counts, reached, pct, np, hubCounts }
  })
}

export function GroupStatsView({ campuses, onClose }) {
  const groupStats = useMemo(() => computeGroupStats(campuses), [campuses])
  const opportunities = useMemo(() => computeOpportunities(campuses), [campuses])
  const mapped = campuses.filter((c) => c.lat && c.lng)
  const overallTotal = mapped.length
  const overallReached = mapped.filter((c) => isReached(c.status)).length
  const overallPct = overallTotal ? Math.round((overallReached / overallTotal) * 100) : 0
  const overallNp = mapped.filter((c) => c.needs_plan).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: '32px 16px 48px',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '960px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0',
        }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#1C1610' }}>Group Statistics</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Campus reach breakdown by region</div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px',
            color: '#888', lineHeight: 1, padding: '4px 8px', borderRadius: '6px',
          }} aria-label="Close">×</button>
        </div>

        {/* Overall hero row */}
        <div style={{ display: 'flex', gap: '1px', background: '#f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
          {[
            { label: 'Total Campuses', value: overallTotal, color: '#1C1610' },
            { label: 'Overall Reach', value: `${overallPct}%`, color: '#1e8e3e' },
            { label: 'Needs Coverage Plan', value: overallNp, color: NEEDS_PLAN_COLOR },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              flex: 1, background: '#fff', padding: '16px 20px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Per-group cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0', background: '#f0f0f0' }}>
          {groupStats.map(({ group, tot, counts, pct, np, hubCounts }) => {
            const groupColor = GROUP_COLORS[group]
            return (
              <div key={group} style={{ background: '#fff', display: 'flex', flexDirection: 'column', margin: '1px 0 1px 1px' }}>
                {/* Card accent + title */}
                <div style={{ height: '4px', background: groupColor }} />
                <div style={{ padding: '16px 18px 0' }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: groupColor }}>{group}</div>

                  {/* Mini stat chips */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <Chip label="Campuses" value={tot} color="#1C1610" />
                    <Chip label="Reach" value={`${pct}%`} color="#1e8e3e" />
                    <Chip label="Needs Plan" value={np} color={NEEDS_PLAN_COLOR} />
                  </div>

                  {/* Reach progress bar */}
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Reach progress</span><span style={{ fontWeight: '600', color: '#1e8e3e' }}>{pct}%</span>
                    </div>
                    <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#1e8e3e', borderRadius: '3px', transition: 'width 0.4s' }} />
                    </div>
                  </div>

                  {/* Status stacked bar */}
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '5px' }}>Status breakdown</div>
                    {tot > 0 ? (
                      <div style={{ display: 'flex', height: '28px', borderRadius: '5px', overflow: 'hidden', gap: '1px' }}>
                        {STATUS_ORDER.map((s) => {
                          const cnt = counts[s]
                          if (!cnt) return null
                          const widthPct = (cnt / tot) * 100
                          const col = STATUS[s].color
                          const showLabel = widthPct >= 9
                          return (
                            <div key={s} title={`${s}: ${cnt} (${Math.round(widthPct)}%)`}
                              style={{
                                width: `${widthPct}%`, background: col,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', fontWeight: '700', color: labelInk(col),
                                minWidth: showLabel ? undefined : '4px',
                              }}>
                              {showLabel && cnt}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ height: '28px', background: '#f5f5f5', borderRadius: '5px' }} />
                    )}
                    {/* Legend + table for accessibility (amber contrast relief) */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: '8px' }}>
                      {STATUS_ORDER.map((s) => (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#555' }}>
                          <span style={{
                            display: 'inline-block', width: '8px', height: '8px',
                            borderRadius: '2px', background: STATUS[s].color, flexShrink: 0,
                          }} />
                          <span>{STATUS[s].emoji} {counts[s]}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top hubs */}
                  {hubCounts.length > 0 && (
                    <div style={{ marginTop: '14px', paddingBottom: '16px' }}>
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Top hubs by campus count</div>
                      {hubCounts.map(({ name, count }, i) => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                          <div style={{ width: '14px', fontSize: '10px', color: '#bbb', textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                          <div style={{ flex: 1, background: '#f5f5f5', borderRadius: '3px', overflow: 'hidden', height: '16px' }}>
                            <div style={{
                              height: '100%', background: `${groupColor}28`,
                              width: `${(count / hubCounts[0].count) * 100}%`,
                              borderRight: `2px solid ${groupColor}`,
                            }} />
                          </div>
                          <div style={{ fontSize: '11px', color: '#444', minWidth: 0, flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {name}
                          </div>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: groupColor, flexShrink: 0 }}>{count}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Reach Opportunities — momentum insight */}
        <div style={{ padding: '20px 24px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#1C1610' }}>🎯 Reach Opportunities</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px', marginBottom: '14px' }}>
            Not-yet-reached campuses within {OPPORTUNITY_RADIUS_KM}km of an existing fellowship — momentum to build on.
          </div>

          {opportunities.every((o) => o.top.length === 0) ? (
            <div style={{ fontSize: '13px', color: '#999' }}>No nearby opportunities detected.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
              {opportunities.map(({ group, top, total }) => (
                top.length > 0 && (
                  <div key={group}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: GROUP_COLORS[group], marginBottom: '8px' }}>
                      {group}{total > top.length ? ` — showing ${top.length} of ${total}` : ''}
                    </div>
                    {top.map((o) => (
                      <div key={o.target.id} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f5f5f5' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#333' }}>{displayName(o.target)}</div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                          {o.distanceKm.toFixed(1)}km from{' '}
                          <span style={{ color: STATUS[o.anchor.status]?.color || '#888', fontWeight: '600' }}>
                            {displayName(o.anchor)}
                          </span>{' '}
                          ({o.anchor.status.replace(' Fellowship', '')})
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        {/* Full status × group table (accessibility / amber contrast relief) */}
        <div style={{ padding: '20px 24px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#888', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Detail table</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={thStyle()}>Group</th>
                  {STATUS_ORDER.map((s) => (
                    <th key={s} style={thStyle()}>
                      <span style={{ marginRight: '3px' }}>{STATUS[s].emoji}</span>
                      {s.replace(' Fellowship', '')}
                    </th>
                  ))}
                  <th style={thStyle()}>◈ Needs Plan</th>
                  <th style={thStyle()}>Total</th>
                  <th style={thStyle()}>Reach %</th>
                </tr>
              </thead>
              <tbody>
                {groupStats.map(({ group, tot, counts, pct, np }) => (
                  <tr key={group}>
                    <td style={tdStyle()}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: GROUP_COLORS[group], marginRight: '6px' }} />
                      {group}
                    </td>
                    {STATUS_ORDER.map((s) => (
                      <td key={s} style={tdStyle('center')}>{counts[s]}</td>
                    ))}
                    <td style={tdStyle('center')}>{np}</td>
                    <td style={{ ...tdStyle('center'), fontWeight: '600' }}>{tot}</td>
                    <td style={{ ...tdStyle('center'), fontWeight: '600', color: '#1e8e3e' }}>{pct}%</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ borderTop: '2px solid #e0e0e0', fontWeight: '700', background: '#fafafa' }}>
                  <td style={tdStyle()}>All Regions</td>
                  {STATUS_ORDER.map((s) => (
                    <td key={s} style={tdStyle('center')}>
                      {groupStats.reduce((sum, g) => sum + g.counts[s], 0)}
                    </td>
                  ))}
                  <td style={tdStyle('center')}>{overallNp}</td>
                  <td style={tdStyle('center')}>{overallTotal}</td>
                  <td style={{ ...tdStyle('center'), color: '#1e8e3e' }}>{overallPct}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Chip({ label, value, color }) {
  return (
    <div style={{
      background: `${color}10`, border: `1px solid ${color}22`,
      borderRadius: '6px', padding: '4px 8px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '16px', fontWeight: '700', color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#999', marginTop: '1px' }}>{label}</div>
    </div>
  )
}

function thStyle() {
  return {
    padding: '6px 10px', textAlign: 'left', color: '#888', fontWeight: '600',
    borderBottom: '1px solid #e8e8e8', whiteSpace: 'nowrap',
  }
}

function tdStyle(align = 'left') {
  return { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', textAlign: align, color: '#333' }
}
