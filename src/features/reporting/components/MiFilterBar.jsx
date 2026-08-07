import { getDateRange } from '../lib/miHelpers'

const STYLES = `
  .mi-filter-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 14px 0;
    border-bottom: 0.5px solid #EDE8DC;
    margin-bottom: 18px;
  }
  .mi-filter-label {
    font-size: 12px;
    color: #9E9488;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .mi-seg {
    display: flex;
    border: 0.5px solid #EDE8DC;
    border-radius: 6px;
    overflow: hidden;
  }
  .mi-seg-btn {
    font-size: 12px;
    padding: 6px 12px;
    cursor: pointer;
    color: #9E9488;
    background: #fff;
    border-right: 0.5px solid #EDE8DC;
    transition: background 0.1s, color 0.1s;
    white-space: nowrap;
  }
  .mi-seg-btn:last-child {
    border-right: none;
  }
  .mi-seg-btn.active {
    background: #4C2A92;
    color: #fff;
    font-weight: 500;
  }
  .mi-seg-btn:hover:not(.active) {
    background: #F5F3ED;
  }
  .mi-date-inputs {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mi-date-input {
    font-size: 12px;
    padding: 5px 8px;
    border: 0.5px solid #EDE8DC;
    border-radius: 4px;
    background: #fff;
    color: #2D2A22;
  }
`

export default function MiFilterBar({
  timeWindow = '6m', // '3m', '6m', 'custom'
  onTimeWindowChange = () => {},
  customDateFrom = null,
  customDateTo = null,
  onDateChange = () => {},
  eventType = 'all', // 'all', 'service', 'cell'
  onEventTypeChange = () => {},
}) {
  const handleTimeWindowClick = (window) => {
    onTimeWindowChange(window)
  }

  const handleDateChange = (field, value) => {
    if (field === 'from') {
      onDateChange({ dateFrom: value, dateTo: customDateTo })
    } else {
      onDateChange({ dateFrom: customDateFrom, dateTo: value })
    }
  }

  const handleEventTypeClick = (type) => {
    onEventTypeChange(type)
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="mi-filter-bar">
        {/* Time Window */}
        <span className="mi-filter-label">Time window</span>
        <div className="mi-seg">
          <button
            className={`mi-seg-btn ${timeWindow === '3m' ? 'active' : ''}`}
            onClick={() => handleTimeWindowClick('3m')}
          >
            3 months
          </button>
          <button
            className={`mi-seg-btn ${timeWindow === '6m' ? 'active' : ''}`}
            onClick={() => handleTimeWindowClick('6m')}
          >
            6 months
          </button>
          <button
            className={`mi-seg-btn ${timeWindow === 'custom' ? 'active' : ''}`}
            onClick={() => handleTimeWindowClick('custom')}
          >
            Custom
          </button>
        </div>

        {/* Custom Date Range (shown when custom is selected) */}
        {timeWindow === 'custom' && (
          <div className="mi-date-inputs">
            <input
              type="date"
              className="mi-date-input"
              value={customDateFrom || ''}
              onChange={(e) => handleDateChange('from', e.target.value)}
            />
            <span style={{ fontSize: '12px', color: '#9E9488' }}>to</span>
            <input
              type="date"
              className="mi-date-input"
              value={customDateTo || ''}
              onChange={(e) => handleDateChange('to', e.target.value)}
            />
          </div>
        )}

        {/* Meeting Type */}
        <span className="mi-filter-label" style={{ marginLeft: '8px' }}>
          Meeting type
        </span>
        <div className="mi-seg">
          <button
            className={`mi-seg-btn ${eventType === 'all' ? 'active' : ''}`}
            onClick={() => handleEventTypeClick('all')}
          >
            All
          </button>
          <button
            className={`mi-seg-btn ${eventType === 'service' ? 'active' : ''}`}
            onClick={() => handleEventTypeClick('service')}
          >
            Service
          </button>
          <button
            className={`mi-seg-btn ${eventType === 'cell' ? 'active' : ''}`}
            onClick={() => handleEventTypeClick('cell')}
          >
            Cell
          </button>
        </div>
      </div>
    </>
  )
}
