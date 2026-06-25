import { formatDistanceToNow } from 'date-fns'

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  borderRadius: 8,
  overflow: 'hidden',
  border: '1px solid #e0e0e0',
  fontFamily: 'inherit',
}

const theadStyle = {
  background: '#f5f5f5',
  borderBottom: '1px solid #d0d0d0',
}

const thStyle = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: 12,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #e8e8e8',
  fontSize: 13,
  color: '#2c2c2a',
}

const oldValueStyle = {
  ...tdStyle,
  color: '#999',
  fontFamily: 'Monaco, monospace',
  fontSize: 12,
}

const newValueStyle = {
  ...tdStyle,
  fontFamily: 'Monaco, monospace',
  fontSize: 12,
  fontWeight: 600,
  background: '#f0f7ff',
  borderLeft: '2px solid #667eea',
  paddingLeft: '14px',
}

const actionButtonStyle = (color) => ({
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  background: 'white',
  color: color,
  border: `1px solid ${color}`,
  borderRadius: 4,
  cursor: 'pointer',
  transition: 'all 0.2s',
  marginRight: '6px',
})

const statusBadgeStyle = (status) => {
  const styles = {
    pending: { background: '#fff3cd', color: '#856404', border: '1px solid #ffc107' },
    approved: { background: '#d4edda', color: '#155724', border: '1px solid #28a745' },
    rejected: { background: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' },
  }
  return {
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    ...styles[status],
  }
}

export default function CampusEditsTable({ edits, status, onApprove, onReject }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <th style={thStyle}>Campus</th>
            <th style={thStyle}>Field</th>
            <th style={thStyle}>Old Value</th>
            <th style={thStyle}>New Value</th>
            <th style={thStyle}>Submitted By</th>
            <th style={thStyle}>Date</th>
            {status === 'pending' && <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>}
            {status !== 'pending' && <th style={thStyle}>Reviewed By</th>}
          </tr>
        </thead>
        <tbody>
          {edits.map((edit) => (
            <tr key={edit.id} style={{ transition: 'background 0.2s' }}>
              <td style={tdStyle}>
                <strong>{edit.campuses?.name || 'Unknown'}</strong>
                {edit.campuses?.institution && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    {edit.campuses.institution}
                  </div>
                )}
              </td>
              <td style={tdStyle}>
                <span style={statusBadgeStyle(edit.status)}>{edit.field_name}</span>
              </td>
              <td style={oldValueStyle}>{edit.old_value || '(empty)'}</td>
              <td style={newValueStyle}>{edit.new_value}</td>
              <td style={tdStyle}>
                <div>{edit.submitted_user?.name || 'Unknown'}</div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                  {edit.submitted_user?.email}
                </div>
              </td>
              <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
                {edit.submitted_at ? formatDistanceToNow(new Date(edit.submitted_at), { addSuffix: true }) : '-'}
              </td>
              {status === 'pending' && (
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <button
                    onClick={() => onApprove(edit)}
                    style={actionButtonStyle('#10b981')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#d4edda'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white'
                    }}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => onReject(edit)}
                    style={actionButtonStyle('#ef4444')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f8d7da'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white'
                    }}
                  >
                    ✗ Reject
                  </button>
                </td>
              )}
              {status !== 'pending' && (
                <td style={tdStyle}>
                  <div>{edit.reviewed_user?.name || '-'}</div>
                  {edit.reviewed_at && (
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {formatDistanceToNow(new Date(edit.reviewed_at), { addSuffix: true })}
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
