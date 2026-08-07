import { useMiAttendanceStats } from '../hooks/useMiAttendanceStats'
import { useMiFoundationSchool } from '../hooks/useMiFoundationSchool'
import { useMiFirstTimers } from '../hooks/useMiFirstTimers'
import { MI_COLORS, FREQ_LABELS, formatPercent } from '../lib/miHelpers'

const STYLES = `
  .mi-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
  }
  .mi-card {
    background: #fff;
    border: 0.5px solid #EDE8DC;
    border-radius: 12px;
    padding: 12px 14px;
  }
  .mi-card.clickable {
    cursor: pointer;
    transition: border 0.1s, box-shadow 0.1s;
  }
  .mi-card.clickable:hover {
    border-color: #4C2A92;
    box-shadow: 0 2px 6px rgba(76, 42, 146, 0.08);
  }
  .mi-card.clickable.active {
    border: 1.5px solid #4C2A92;
    background: #EEEDFE;
  }
  .mi-card-label {
    font-size: 11px;
    color: #9E9488;
    margin: 0 0 4px;
  }
  .mi-card-value {
    font-size: 22px;
    font-weight: 500;
    color: #2D2A22;
    margin: 0;
    line-height: 1;
  }
  .mi-card-sub {
    font-size: 11px;
    color: #BFBAB0;
    margin: 3px 0 0;
  }
  .mi-card-pct {
    font-size: 11px;
    font-weight: 500;
    margin: 4px 0 0;
  }
  .mi-card-bar {
    margin-top: 7px;
    height: 3px;
    border-radius: 2px;
    background: #E5DACC;
    overflow: hidden;
  }
  .mi-card-fill {
    height: 100%;
    border-radius: 2px;
  }
  .mi-section-title {
    font-size: 12px;
    font-weight: 500;
    color: #BFBAB0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 10px;
  }
  .mi-row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 18px;
    flex-wrap: wrap;
  }
  .mi-legend {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
    font-size: 11px;
  }
  .mi-legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #9E9488;
  }
  .mi-legend-swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .mi-metric-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-top: 18px;
  }
  .mi-metric-box {
    background: #FAFAF8;
    border: 0.5px solid #EDE8DC;
    border-radius: 8px;
    padding: 12px;
  }
  .mi-metric-box-title {
    font-size: 12px;
    font-weight: 500;
    color: #9E9488;
    margin: 0 0 8px;
  }
  .mi-metric-box-stat {
    font-size: 18px;
    font-weight: 600;
    color: #2D2A22;
    margin: 0 0 2px;
  }
`

export default function MiDashboardView({ dateFrom, dateTo, eventType = 'all', onSelectFreq = () => {} }) {
  const { data: stats, isLoading: statsLoading } = useMiAttendanceStats({
    dateFrom,
    dateTo,
    eventType,
  })

  const { data: fsStats, isLoading: fsLoading } = useMiFoundationSchool()
  const { data: firstTimers, isLoading: ftLoading } = useMiFirstTimers({ monthsBack: 1 })

  if (statsLoading) {
    return <div style={{ padding: '20px', color: '#9E9488' }}>Loading attendance data...</div>
  }

  if (!stats) {
    return <div style={{ padding: '20px', color: '#9E9488' }}>No data available</div>
  }

  const total = stats.in_system_total || 1
  const activeCount = stats.active || 0
  const activePercent = formatPercent(activeCount, total, 0)

  return (
    <>
      <style>{STYLES}</style>

      <div>
        <p className="mi-section-title">Member categories — {`${stats.in_system_total} total`}</p>

        {/* Frequency breakdown cards */}
        <div className="mi-cards">
          <div className="mi-card">
            <p className="mi-card-label">In system</p>
            <p className="mi-card-value">{stats.in_system_total}</p>
            <p className="mi-card-sub">Total roster</p>
          </div>

          <div
            className="mi-card clickable"
            onClick={() => onSelectFreq('active')}
            role="button"
            tabIndex={0}
          >
            <p className="mi-card-label">Active</p>
            <p className="mi-card-value" style={{ color: MI_COLORS.freq3Plus }}>
              {stats.active}
            </p>
            <p className="mi-card-sub">≥ 1 meeting</p>
            <p className="mi-card-pct" style={{ color: MI_COLORS.freq3Plus }}>
              {activePercent} of roster
            </p>
          </div>

          <div
            className="mi-card clickable"
            onClick={() => onSelectFreq('once')}
            role="button"
            tabIndex={0}
          >
            <p className="mi-card-label">Once</p>
            <p className="mi-card-value">{stats.freq_once}</p>
            <p className="mi-card-sub">Exactly 1 time</p>
            <div className="mi-card-bar">
              <div
                className="mi-card-fill"
                style={{
                  width: `${(stats.freq_once / (stats.active || 1)) * 100}%`,
                  background: MI_COLORS.freq1to2,
                }}
              />
            </div>
          </div>

          <div
            className="mi-card clickable"
            onClick={() => onSelectFreq('twice')}
            role="button"
            tabIndex={0}
          >
            <p className="mi-card-label">Twice</p>
            <p className="mi-card-value">{stats.freq_twice}</p>
            <p className="mi-card-sub">Exactly 2 times</p>
            <div className="mi-card-bar">
              <div
                className="mi-card-fill"
                style={{
                  width: `${(stats.freq_twice / (stats.active || 1)) * 100}%`,
                  background: MI_COLORS.freq1to2,
                }}
              />
            </div>
          </div>

          <div
            className="mi-card clickable"
            onClick={() => onSelectFreq('thrice')}
            role="button"
            tabIndex={0}
          >
            <p className="mi-card-label">3 times</p>
            <p className="mi-card-value">{stats.freq_thrice}</p>
            <p className="mi-card-sub">Exactly 3 times</p>
            <div className="mi-card-bar">
              <div
                className="mi-card-fill"
                style={{
                  width: `${(stats.freq_thrice / (stats.active || 1)) * 100}%`,
                  background: MI_COLORS.freq3,
                }}
              />
            </div>
          </div>

          <div
            className="mi-card clickable"
            onClick={() => onSelectFreq('3plus')}
            role="button"
            tabIndex={0}
          >
            <p className="mi-card-label">3+ times</p>
            <p className="mi-card-value">{stats.freq_three_plus}</p>
            <p className="mi-card-sub">Consistent attenders</p>
            <div className="mi-card-bar">
              <div
                className="mi-card-fill"
                style={{
                  width: `${(stats.freq_three_plus / (stats.active || 1)) * 100}%`,
                  background: MI_COLORS.freq3Plus,
                }}
              />
            </div>
          </div>

          <div className="mi-card">
            <p className="mi-card-label">No attendance</p>
            <p className="mi-card-value">{stats.in_system_inactive}</p>
            <p className="mi-card-sub">In system, not seen</p>
            <div className="mi-card-bar">
              <div
                className="mi-card-fill"
                style={{
                  width: `${(stats.in_system_inactive / total) * 100}%`,
                  background: MI_COLORS.inactive,
                }}
              />
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mi-legend">
          <span style={{ fontSize: '11px', color: '#BFBAB0', marginRight: '4px' }}>Frequency breakdown:</span>
          <div className="mi-legend-item">
            <div className="mi-legend-swatch" style={{ background: MI_COLORS.freq3Plus }} />
            3+ times
          </div>
          <div className="mi-legend-item">
            <div className="mi-legend-swatch" style={{ background: MI_COLORS.freq3 }} />
            3 times
          </div>
          <div className="mi-legend-item">
            <div className="mi-legend-swatch" style={{ background: MI_COLORS.freq1to2 }} />
            1–2 times
          </div>
          <div className="mi-legend-item">
            <div className="mi-legend-swatch" style={{ background: MI_COLORS.inactive }} />
            No attendance
          </div>
        </div>

        {/* Additional metrics */}
        <div className="mi-metric-row">
          {fsStats && (
            <div className="mi-metric-box">
              <p className="mi-metric-box-title">Foundation School Completion</p>
              <p className="mi-metric-box-stat">{fsStats.percentages.completed}%</p>
              <p style={{ fontSize: '11px', color: '#9E9488', margin: 0 }}>
                {fsStats.completed} of {fsStats.total} members
              </p>
            </div>
          )}

          {firstTimers && (
            <div className="mi-metric-box">
              <p className="mi-metric-box-title">New Members This Month</p>
              <p className="mi-metric-box-stat">{(firstTimers.service || 0) + (firstTimers.cell || 0)}</p>
              <p style={{ fontSize: '11px', color: '#9E9488', margin: 0 }}>
                Service: {firstTimers.service || 0}, Cell: {firstTimers.cell || 0}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
