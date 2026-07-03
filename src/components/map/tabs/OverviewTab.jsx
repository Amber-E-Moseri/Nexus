export function OverviewTab({ stats, campus }) {
  return (
    <div className="blw-overview-tab">
      {campus.photo_url && (
        <div style={{ marginBottom: '16px' }}>
          <img
            src={campus.photo_url}
            alt={campus.name}
            style={{
              width: '100%',
              height: '200px',
              objectFit: 'cover',
              borderRadius: '8px',
            }}
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
        </div>
      )}
      <div className="blw-overview-header">
        <h3>Campus Overview</h3>
        {campus.status && <p className="blw-overview-status">{campus.status}</p>}
      </div>

      <div className="blw-overview-grid">
        <div className="blw-stat-card">
          <div className="blw-stat-label">Total Prayers</div>
          <div className="blw-stat-value">{stats.totalPrayers}</div>
          <div className="blw-stat-detail">prayer sessions recorded</div>
        </div>

        <div className="blw-stat-card">
          <div className="blw-stat-label">Active Requests</div>
          <div className="blw-stat-value">{stats.activeRequests}</div>
          <div className="blw-stat-detail">unresolved requests</div>
        </div>

        <div className="blw-stat-card">
          <div className="blw-stat-label">This Week</div>
          <div className="blw-stat-value">{stats.thisWeek}</div>
          <div className="blw-stat-detail">prayers in 7 days</div>
        </div>
      </div>

      <div className="blw-overview-section">
        <h4>Campus Information</h4>
        <div className="blw-info-list">
          {campus.institution && (
            <div className="blw-info-item">
              <span className="blw-info-label">Institution:</span>
              <span className="blw-info-value">{campus.institution}</span>
            </div>
          )}
          {campus.hub && (
            <div className="blw-info-item">
              <span className="blw-info-label">Nearest Hub:</span>
              <span className="blw-info-value">{campus.hub}</span>
            </div>
          )}
          {campus.group_name && (
            <div className="blw-info-item">
              <span className="blw-info-label">Region:</span>
              <span className="blw-info-value">{campus.group_name}</span>
            </div>
          )}
          {campus.spotify_playlist_id && (
            <div className="blw-info-item">
              <span className="blw-info-label">Spotify Playlist:</span>
              <span className="blw-info-value">🎵 Connected</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
