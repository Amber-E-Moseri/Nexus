import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { formatRelativeDate } from '../../lib/dateUtils'
import { supabase } from '../../lib/supabase'

const PAGE_BG = '#F9F7F3'
const PANEL_BORDER = '#EDE8DC'
const PANEL_BG = '#FFFFFF'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const ACCENT = '#4C2A92'
const DANGER = '#C94830'
const SUCCESS = '#2D8653'

const INPUT = {
  border: `1px solid ${PANEL_BORDER}`,
  borderRadius: 9,
  padding: '8px 11px',
  fontSize: 13,
  color: TEXT,
  background: PANEL_BG,
  fontFamily: 'inherit',
  outline: 'none',
}

const TH = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: MUTED,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  background: PAGE_BG,
  borderBottom: `1px solid ${PANEL_BORDER}`,
  whiteSpace: 'nowrap',
}

const TD = {
  padding: '11px 12px',
  fontSize: 13,
  color: TEXT,
  verticalAlign: 'top',
  borderBottom: '1px solid #F5F2EC',
}

const FILTER_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All' },
]

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function badgeStyle(status) {
  const failed = status === 'failed'
  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    padding: '3px 9px',
    fontSize: 11,
    fontWeight: 700,
    background: failed ? '#FCEDEA' : '#EEF6F1',
    color: failed ? DANGER : SUCCESS,
  }
}

function csvCell(value) {
  const normalized = String(value ?? '')
  return `"${normalized.replace(/"/g, '""')}"`
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function EmailLogPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [rows, setRows] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateRange, setDateRange] = useState('7')
  const [search, setSearch] = useState('')
  const [expandedRows, setExpandedRows] = useState({})

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)

      const [{ data: logs, error: logError }, { data: users, error: userError }] = await Promise.all([
        supabase
          .from('absence_email_log')
          .select('*')
          .order('sent_at', { ascending: false })
          .limit(200),
        supabase.from('users').select('id, name, email'),
      ])

      if (!active) return

      if (logError) {
        setError(logError.message)
        setRows([])
        setLoading(false)
        return
      }

      if (userError) {
        setError(userError.message)
        setRows(logs ?? [])
        setLoading(false)
        return
      }

      setRows(logs ?? [])
      setUserMap(Object.fromEntries((users ?? []).map((user) => [user.id, user])))
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [])

  const monthStart = useMemo(() => startOfMonth(), [])

  const stats = useMemo(() => {
    const monthRows = rows.filter((row) => {
      const sentAt = toDate(row.sent_at)
      return sentAt && sentAt >= monthStart
    })

    return {
      totalSent: monthRows.filter((row) => row.status === 'sent').length,
      failed: monthRows.filter((row) => row.status === 'failed').length,
      uniqueRecipients: new Set(
        rows
          .map((row) => (row.recipient_email ?? '').trim().toLowerCase())
          .filter(Boolean),
      ).size,
    }
  }, [monthStart, rows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const now = new Date()
    const days = dateRange === 'all' ? null : Number(dateRange)
    const rangeStart = days ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)) : null

    return rows.filter((row) => {
      const sentAt = toDate(row.sent_at)
      if (rangeStart && (!sentAt || sentAt < rangeStart)) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (
        query
        && !(row.recipient_name ?? '').toLowerCase().includes(query)
        && !(row.recipient_email ?? '').toLowerCase().includes(query)
      ) return false
      return true
    })
  }, [dateRange, rows, search, statusFilter])

  function handleExport() {
    downloadCsv('absence-email-log.csv', [
      ['Sent At', 'Recipient', 'Email', 'Subject', 'Status', 'Report ID', 'Sent By', 'Error Message'],
      ...filteredRows.map((row) => [
        row.sent_at ?? '',
        row.recipient_name ?? '',
        row.recipient_email ?? '',
        row.subject ?? '',
        row.status ?? '',
        row.report_id ?? '',
        userMap[row.sent_by]?.name ?? row.sent_by ?? '',
        row.error_message ?? '',
      ]),
    ])
  }

  function toggleExpanded(id) {
    setExpandedRows((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 0', background: PANEL_BG, borderBottom: `1px solid ${PANEL_BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => navigate('/meetings')} style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, padding: 0 }}>
            {'<-'} Meetings
          </button>
          <span style={{ color: '#D8D3C9' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Absence Email Log</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Email Log</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>
              Audit trail for absence follow-up emails sent from the meetings workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={!filteredRows.length}
            style={{
              border: '1px solid #D9D1C3',
              background: PANEL_BG,
              color: ACCENT,
              borderRadius: 9,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 700,
              cursor: filteredRows.length ? 'pointer' : 'not-allowed',
              opacity: filteredRows.length ? 1 : 0.55,
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 24px', background: PAGE_BG, borderBottom: `1px solid ${PANEL_BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Total Sent</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, color: TEXT }}>{stats.totalSent}</div>
            <div style={{ marginTop: 3, fontSize: 12, color: MUTED }}>This month</div>
          </div>
          <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Failed</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, color: DANGER }}>{stats.failed}</div>
            <div style={{ marginTop: 3, fontSize: 12, color: MUTED }}>This month</div>
          </div>
          <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Unique Recipients Reached</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, color: TEXT }}>{stats.uniqueRecipients}</div>
            <div style={{ marginTop: 3, fontSize: 12, color: MUTED }}>Across loaded history</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 24px', background: PAGE_BG, borderBottom: `1px solid ${PANEL_BORDER}`, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} style={INPUT}>
          {FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={INPUT}>
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search recipient name or email..."
          style={{ ...INPUT, minWidth: 260, flex: '1 1 260px' }}
        />
        <span style={{ fontSize: 12, color: MUTED, marginLeft: 'auto' }}>{filteredRows.length} shown</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading email history...</div>
        ) : error ? (
          <div style={{ padding: '18px 20px', background: '#FEF0ED', color: DANGER, border: '1px solid #F5C4B8', borderRadius: 12, fontSize: 13 }}>
            {error}
          </div>
        ) : (
          <div style={{ border: `1px solid ${PANEL_BORDER}`, borderRadius: 14, overflow: 'hidden', background: PANEL_BG }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr>
                  <th style={TH}>Sent At</th>
                  <th style={TH}>Recipient</th>
                  <th style={TH}>Email</th>
                  <th style={TH}>Subject</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Report</th>
                  <th style={TH}>Sent By</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...TD, padding: '36px', textAlign: 'center', color: MUTED }}>
                      No email log entries match the current filters.
                    </td>
                  </tr>
                ) : filteredRows.map((row) => {
                  const failed = row.status === 'failed'
                  const isExpanded = !!expandedRows[row.id]
                  const sentBy = userMap[row.sent_by]?.name ?? (row.sent_by === profile?.id ? profile?.name : row.sent_by) ?? '-'

                  return (
                    <Fragment key={row.id}>
                      <tr
                        onMouseEnter={(event) => { event.currentTarget.style.background = '#FAFAF7' }}
                        onMouseLeave={(event) => { event.currentTarget.style.background = '' }}
                      >
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{formatRelativeDate(row.sent_at, { includeTime: true }) ?? '-'}</td>
                        <td style={TD}>
                          <div style={{ fontWeight: 700 }}>{row.recipient_name}</div>
                          {failed && row.error_message ? (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(row.id)}
                              style={{ border: 'none', background: 'none', color: DANGER, padding: 0, marginTop: 4, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                              title={row.error_message}
                            >
                              {isExpanded ? 'Hide error' : 'View error'}
                            </button>
                          ) : null}
                        </td>
                        <td style={{ ...TD, color: MUTED }}>{row.recipient_email}</td>
                        <td style={TD}>
                          <div style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.subject}>
                            {row.subject}
                          </div>
                        </td>
                        <td style={TD}>
                          <span style={badgeStyle(row.status)}>{row.status === 'failed' ? 'Failed' : 'Sent'}</span>
                        </td>
                        <td style={TD}>
                          {row.report_id ? (
                            <Link to={`/meetings?report=${row.report_id}`} style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>
                              View Report
                            </Link>
                          ) : (
                            <span style={{ color: '#D8D3C9' }}>-</span>
                          )}
                        </td>
                        <td style={{ ...TD, color: MUTED }}>{sentBy}</td>
                      </tr>
                      {failed && isExpanded && row.error_message ? (
                        <tr style={{ background: '#FEF8F6' }}>
                          <td colSpan={7} style={{ ...TD, borderBottom: '1px solid #F5C4B8' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                              Error Message
                            </div>
                            <div style={{ fontSize: 13, color: DANGER }}>{row.error_message}</div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
