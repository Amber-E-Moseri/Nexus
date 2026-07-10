import { STATUS, STATUS_ORDER, NEEDS_PLAN_COLOR, isReached } from './data/status'
import { HUBS } from './data/hubs'

export function HubDetailsPanel({ hubName, campuses, onClose }) {
  if (!hubName || !HUBS[hubName]) return null

  const hub = HUBS[hubName]

  // Find all campuses in this hub (within coverage area)
  const hubCampuses = campuses.filter((c) => c.nearestHubName === hubName && c.lat && c.lng)

  // Calculate hub statistics
  const stats = {
    total: hubCampuses.length,
    statusCounts: {},
    needsPlan: hubCampuses.filter((c) => c.needs_plan).length,
  }

  STATUS_ORDER.forEach((s) => {
    stats.statusCounts[s] = hubCampuses.filter((c) => c.status === s).length
  })

  const reached = hubCampuses.filter((c) => isReached(c.status)).length
  const reachPct = hubCampuses.length ? Math.round((reached / hubCampuses.length) * 100) : 0

  return (
    <div className="blw-side-panel open">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid #e8eaed',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#202124', margin: '0 0 8px 0' }}>
              {hubName}
            </h2>
            <div style={{ fontSize: 12, color: '#9aa0a6' }}>
              {hub.lat?.toFixed(4)}, {hub.lng?.toFixed(4)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#80868b',
              fontSize: 20,
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            ×
          </button>
        </div>

        {/* Statistics */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#9aa0a6', fontWeight: 600 }}>TOTAL CAMPUSES</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#202124', marginTop: 4 }}>
                {stats.total}
              </div>
            </div>
            <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#9aa0a6', fontWeight: 600 }}>REACH</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1e8e3e', marginTop: 4 }}>
                {reachPct}%
              </div>
            </div>
          </div>

          {/* Status breakdown */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9aa0a6', marginBottom: 8 }}>
            STATUS BREAKDOWN
          </div>
          {STATUS_ORDER.map((status) => (
            <div
              key={status}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS[status].color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: '#5f6368' }}>{status.replace(' Fellowship', '')}</span>
              </div>
              <span style={{ fontWeight: 700, color: '#202124' }}>
                {stats.statusCounts[status]}
              </span>
            </div>
          ))}

          {stats.needsPlan > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 8,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: NEEDS_PLAN_COLOR,
                    transform: 'rotate(45deg)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: '#5f6368' }}>Needs Plan</span>
              </div>
              <span style={{ fontWeight: 700, color: '#202124' }}>{stats.needsPlan}</span>
            </div>
          )}

          {/* Reach progress bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: '#9aa0a6', fontWeight: 600, marginBottom: 4 }}>
              COVERAGE
            </div>
            <div style={{ height: 4, background: '#e8eaed', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: '#1e8e3e',
                  width: `${reachPct}%`,
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        </div>

        {/* Campus list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {hubCampuses.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#9aa0a6', fontSize: 12 }}>
              No campuses in this hub
            </div>
          ) : (
            hubCampuses
              .sort((a, b) => a.institution.localeCompare(b.institution))
              .map((campus) => (
                <div
                  key={campus.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #f0f0f0',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: STATUS[campus.status]?.color || '#9aa0a6',
                        flexShrink: 0,
                        marginTop: 3,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#202124' }}>
                        {campus.institution && campus.institution !== campus.campus
                          ? `${campus.institution} — ${campus.campus}`
                          : campus.campus || campus.institution}
                      </div>
                      <div style={{ fontSize: 10, color: '#9aa0a6', marginTop: 2 }}>
                        {campus.status}
                      </div>
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  )
}
