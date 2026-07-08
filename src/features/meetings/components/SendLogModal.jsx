import { useEffect, useState } from 'react'
import { X, Filter, Download } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../context/ToastContext'

const MODAL_OVERLAY = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
}

const MODAL_BOX = {
  background: 'white',
  borderRadius: 12,
  boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
  maxWidth: 800,
  maxHeight: '90vh',
  width: '95%',
  display: 'flex',
  flexDirection: 'column',
}

const MODAL_HEADER = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '20px 24px',
  borderBottom: '1px solid #EDE8DC',
  flexShrink: 0,
}

const MODAL_TITLE = {
  fontSize: 18,
  fontWeight: 700,
  color: '#2D2A22',
  margin: 0,
}

const CLOSE_BUTTON = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#9E9488',
  transition: 'color 0.12s',
}

const MODAL_CONTENT = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '20px 24px',
  overflowY: 'auto',
  flex: 1,
}

const TABLE_WRAPPER = {
  border: '1px solid #EDE8DC',
  borderRadius: 8,
  overflowX: 'auto',
}

const TABLE = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
}

const TH = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  color: '#9E9488',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  background: '#F9F7F3',
  borderBottom: '1px solid #EDE8DC',
  whiteSpace: 'nowrap',
}

const TD = {
  padding: '10px 12px',
  borderBottom: '1px solid #F5F2EC',
  verticalAlign: 'middle',
  color: '#2D2A22',
}

const STATUS_BADGE = {
  display: 'inline-block',
  padding: '3px 8px',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.03em',
}

const MODAL_FOOTER = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 12,
  padding: '16px 24px',
  borderTop: '1px solid #EDE8DC',
  flexShrink: 0,
  background: '#FBF8F2',
}

const BUTTON = {
  padding: '10px 20px',
  borderRadius: 8,
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.12s',
  background: '#4C2A92',
  color: 'white',
}

function getStatusColor(status) {
  switch (status) {
    case 'sent':
      return '#2D8653'
    case 'failed':
      return '#C94830'
    case 'skipped':
      return '#B0A89A'
    default:
      return '#9E9488'
  }
}

function formatDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SendLogModal({ onClose }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    async function loadLogs() {
      try {
        let query = supabase
          .from('absence_email_log')
          .select('*')
          .order('sent_at', { ascending: false })
          .limit(100)

        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter)
        }

        const { data, error } = await query
        if (error) throw error
        setLogs(data ?? [])
      } catch (err) {
        console.error('Failed to load logs:', err)
        showToast('Failed to load email log', 'error')
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [statusFilter, showToast])

  const stats = {
    sent: logs.filter(l => l.status === 'sent').length,
    failed: logs.filter(l => l.status === 'failed').length,
    skipped: logs.filter(l => l.status === 'skipped').length,
  }

  function exportCSV() {
    const csv = [
      ['Date', 'Recipient', 'Email', 'Status', 'Error'].join(','),
      ...logs.map(log =>
        [
          formatDate(log.sent_at),
          log.recipient_name || '—',
          log.recipient_email || '—',
          log.status,
          log.error_message || '—',
        ]
          .map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `email-log-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div style={MODAL_OVERLAY} onClick={onClose}>
        <div style={MODAL_BOX} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '40px', textAlign: 'center', color: '#9E9488' }}>
            Loading email log...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={MODAL_OVERLAY} onClick={onClose}>
      <div style={MODAL_BOX} onClick={e => e.stopPropagation()}>
        <div style={MODAL_HEADER}>
          <h2 style={MODAL_TITLE}>Email Send Log</h2>
          <button
            type="button"
            style={CLOSE_BUTTON}
            onClick={onClose}
            onMouseOver={(e) => { e.currentTarget.style.color = '#2D2A22' }}
            onMouseOut={(e) => { e.currentTarget.style.color = '#9E9488' }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={MODAL_CONTENT}>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div
              style={{
                flex: 1,
                padding: '12px',
                background: '#F9F7F3',
                border: '1px solid #EDE8DC',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ color: '#9E9488', fontWeight: 700, marginBottom: 4 }}>Sent</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#2D8653' }}>{stats.sent}</div>
            </div>
            <div
              style={{
                flex: 1,
                padding: '12px',
                background: '#F9F7F3',
                border: '1px solid #EDE8DC',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ color: '#9E9488', fontWeight: 700, marginBottom: 4 }}>Failed</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#C94830' }}>{stats.failed}</div>
            </div>
            <div
              style={{
                flex: 1,
                padding: '12px',
                background: '#F9F7F3',
                border: '1px solid #EDE8DC',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ color: '#9E9488', fontWeight: 700, marginBottom: 4 }}>Skipped</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#B0A89A' }}>{stats.skipped}</div>
            </div>
          </div>

          {/* Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Filter size={16} style={{ color: '#9E9488' }} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #EDE8DC',
                borderRadius: 6,
                fontSize: 12,
                background: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>

          {/* Table */}
          {logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9E9488', fontSize: 13 }}>
              No emails sent yet
            </div>
          ) : (
            <div style={TABLE_WRAPPER}>
              <table style={TABLE}>
                <thead>
                  <tr>
                    <th style={TH}>Date</th>
                    <th style={TH}>Recipient</th>
                    <th style={TH}>Email</th>
                    <th style={TH}>Status</th>
                    <th style={TH}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td style={TD}>{formatDate(log.sent_at)}</td>
                      <td style={TD}>{log.recipient_name || '—'}</td>
                      <td style={{ ...TD, fontSize: 11, color: '#7A6F5E' }}>{log.recipient_email || '—'}</td>
                      <td style={TD}>
                        <div
                          style={{
                            ...STATUS_BADGE,
                            background: getStatusColor(log.status),
                            color: 'white',
                          }}
                        >
                          {log.status}
                        </div>
                      </td>
                      <td style={{ ...TD, fontSize: 11, color: '#C94830' }}>
                        {log.error_message || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={MODAL_FOOTER}>
          <button
            type="button"
            style={{ ...BUTTON, background: 'white', color: '#4C2A92', border: '1px solid #C4B8E8' }}
            onClick={exportCSV}
            disabled={logs.length === 0}
          >
            <Download size={14} style={{ marginRight: 6, display: 'inline' }} />
            Export CSV
          </button>
          <button type="button" style={BUTTON} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
