import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useMiSubgroups, useMiFellowships, useMiCells } from '../hooks/useMiStructure'
import { useQuery } from '@tanstack/react-query'
import { fetchAllSubgroupStats, fetchAllFellowshipStats } from '../lib/miApi'
import MiBreadcrumb from '../components/MiBreadcrumb'
import { MI_COLORS, formatPercent } from '../lib/miHelpers'

const STYLES = `
  .mi-hier-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .mi-hier-table th {
    text-align: left;
    font-size: 11px;
    font-weight: 500;
    color: #9E9488;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 8px 10px;
    border-bottom: 0.5px solid #EDE8DC;
    white-space: nowrap;
  }
  .mi-hier-table th.num {
    text-align: right;
  }
  .mi-hier-table td {
    padding: 9px 10px;
    border-bottom: 0.5px solid #F5F3ED;
    vertical-align: middle;
  }
  .mi-hier-table td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: #2D2A22;
  }
  .mi-hier-table tr:hover td {
    background: #FAFAF8;
  }
  .mi-hier-row-link {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
    color: #2D2A22;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    font-family: inherit;
    text-align: left;
  }
  .mi-hier-row-link:hover {
    color: #4C2A92;
  }
  .mi-mini-bar {
    display: flex;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    min-width: 80px;
    background: #EDE8DC;
  }
  .mi-pct-label {
    font-size: 11px;
    color: #9E9488;
    margin-top: 2px;
  }
`

function FreqMiniBar({ stats }) {
  const total = stats.in_system_total || 1
  const segments = [
    { key: 'freq_three_plus', color: MI_COLORS.freq3Plus },
    { key: 'freq_thrice', color: MI_COLORS.freq3 },
    { key: 'freq_twice', color: MI_COLORS.freq1to2 },
    { key: 'freq_once', color: MI_COLORS.freq1to2 },
  ]
  return (
    <div className="mi-mini-bar">
      {segments.map(({ key, color }) => {
        const pct = (stats[key] / total) * 100
        if (pct < 0.5) return null
        return <div key={key} style={{ width: `${pct}%`, background: color, flexShrink: 0 }} />
      })}
    </div>
  )
}

function StatsRow({ stats }) {
  if (!stats) return <td className="num" colSpan={6} style={{ color: '#BFBAB0' }}>—</td>
  const activeRate = formatPercent(stats.active, stats.in_system_total, 0)
  return (
    <>
      <td className="num">{stats.in_system_total}</td>
      <td className="num" style={{ color: MI_COLORS.freq3Plus, fontWeight: 500 }}>{stats.active}</td>
      <td className="num">{stats.freq_once}</td>
      <td className="num">{stats.freq_twice}</td>
      <td className="num">{stats.freq_thrice}</td>
      <td className="num">{stats.freq_three_plus}</td>
      <td>
        <FreqMiniBar stats={stats} />
        <div className="mi-pct-label">{activeRate} active</div>
      </td>
    </>
  )
}

function SubgroupTable({ filters, onDrillDown }) {
  const { data: subgroups = [], isLoading: sgLoading } = useMiSubgroups()
  const { data: sgStats, isLoading: statsLoading } = useQuery({
    queryKey: ['mi_all_subgroup_stats', filters],
    queryFn: () => fetchAllSubgroupStats(filters),
    staleTime: 30000,
  })

  if (sgLoading || statsLoading) return <div style={{ padding: 20, color: '#9E9488' }}>Loading hierarchy...</div>

  return (
    <table className="mi-hier-table">
      <thead>
        <tr>
          <th>Subgroup</th>
          <th className="num">In system</th>
          <th className="num">Active</th>
          <th className="num">1×</th>
          <th className="num">2×</th>
          <th className="num">3×</th>
          <th className="num">3+×</th>
          <th>Breakdown</th>
        </tr>
      </thead>
      <tbody>
        {subgroups.map(sg => {
          const stats = sgStats?.get(sg.id)
          return (
            <tr key={sg.id}>
              <td>
                <button className="mi-hier-row-link" onClick={() => onDrillDown({ type: 'subgroup', id: sg.id, name: sg.name })}>
                  {sg.name}
                  <ChevronRight size={14} color="#BFBAB0" />
                </button>
              </td>
              <StatsRow stats={stats} />
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function FellowshipTable({ subgroupId, subgroupName, filters, onDrillDown }) {
  const { data: fellowships = [], isLoading: fLoading } = useMiFellowships(subgroupId)
  const { data: fStats, isLoading: statsLoading } = useQuery({
    queryKey: ['mi_all_fellowship_stats', subgroupId, filters],
    queryFn: () => fetchAllFellowshipStats(subgroupId, filters),
    staleTime: 30000,
  })

  if (fLoading || statsLoading) return <div style={{ padding: 20, color: '#9E9488' }}>Loading fellowships...</div>

  return (
    <table className="mi-hier-table">
      <thead>
        <tr>
          <th>Fellowship</th>
          <th className="num">In system</th>
          <th className="num">Active</th>
          <th className="num">1×</th>
          <th className="num">2×</th>
          <th className="num">3×</th>
          <th className="num">3+×</th>
          <th>Breakdown</th>
        </tr>
      </thead>
      <tbody>
        {fellowships.map(f => {
          const stats = fStats?.get(f.id)
          return (
            <tr key={f.id}>
              <td>
                <button className="mi-hier-row-link" onClick={() => onDrillDown({ type: 'fellowship', id: f.id, name: f.name, subgroupId, subgroupName })}>
                  {f.name}
                  <ChevronRight size={14} color="#BFBAB0" />
                </button>
              </td>
              <StatsRow stats={stats} />
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function CellTable({ fellowshipId }) {
  const { data: cells = [], isLoading } = useMiCells(fellowshipId)
  if (isLoading) return <div style={{ padding: 20, color: '#9E9488' }}>Loading cells...</div>

  return (
    <table className="mi-hier-table">
      <thead>
        <tr>
          <th>Cell / BSC</th>
          <th className="num">Members</th>
        </tr>
      </thead>
      <tbody>
        {cells.map(cell => (
          <tr key={cell.id}>
            <td style={{ fontWeight: 500 }}>{cell.name}</td>
            <td className="num">—</td>
          </tr>
        ))}
        {cells.length === 0 && (
          <tr><td colSpan={2} style={{ color: '#9E9488', padding: '16px 10px' }}>No cells found</td></tr>
        )}
      </tbody>
    </table>
  )
}

export default function MiHierarchyView({ dateFrom, dateTo, eventType }) {
  const filters = { dateFrom, dateTo, eventType: eventType === 'all' ? 'all' : eventType }
  const [drilldown, setDrilldown] = useState(null) // null | { type: 'subgroup'|'fellowship', id, name, ... }

  const crumbs = [{ label: 'All subgroups', key: null }]
  if (drilldown?.type === 'subgroup') crumbs.push({ label: drilldown.name, key: 'subgroup' })
  if (drilldown?.type === 'fellowship') {
    crumbs.push({ label: drilldown.subgroupName, key: 'subgroup', id: drilldown.subgroupId, name: drilldown.subgroupName })
    crumbs.push({ label: drilldown.name, key: 'fellowship' })
  }

  const handleBreadcrumb = (crumb) => {
    if (crumb.key === null) setDrilldown(null)
    else if (crumb.key === 'subgroup') setDrilldown({ type: 'subgroup', id: crumb.id, name: crumb.name })
  }

  return (
    <>
      <style>{STYLES}</style>
      <MiBreadcrumb crumbs={crumbs} onNavigate={handleBreadcrumb} />
      <div style={{ overflowX: 'auto' }}>
        {!drilldown && (
          <SubgroupTable filters={filters} onDrillDown={setDrilldown} />
        )}
        {drilldown?.type === 'subgroup' && (
          <FellowshipTable
            subgroupId={drilldown.id}
            subgroupName={drilldown.name}
            filters={filters}
            onDrillDown={setDrilldown}
          />
        )}
        {drilldown?.type === 'fellowship' && (
          <CellTable fellowshipId={drilldown.id} />
        )}
      </div>
    </>
  )
}
