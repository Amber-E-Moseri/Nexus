import { useEffect, useState } from 'react'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const ACTION_LABELS = {
  invitation_created: 'Invitation Sent',
  invitation_cancelled: 'Invitation Cancelled',
  user_activated: 'User Activated',
  user_status_changed: 'Status Changed',
  department_membership_changed: 'Department Changed',
  pastor_assignment_changed: 'Pastor Assignment Changed',
}

const ENTITY_TYPE_LABELS = {
  user: 'User',
  user_invitation: 'Invitation',
  task: 'Task',
  meeting: 'Meeting',
  sprint: 'Sprint',
  calendar_event: 'Calendar Event',
}

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

function formatDateTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export default function ActivityLogPage() {
  const { user, role, departmentId } = useAuth()
  const [logs, setLogs] = useState([])
  const [allLogs, setAllLogs] = useState([])
  const [users, setUsers] = useState([])
  const [actions, setActions] = useState([])
  const [entityTypes, setEntityTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    userId: '',
    action: '',
    entityType: 'All',
  })

  const [pagination, setPagination] = useState({ page: 1, perPage: 50 })
  const ROWS_PER_PAGE = 50

  useEffect(() => {
    if (role !== 'super_admin' && role !== 'dept_lead') {
      window.location.href = '/dashboard'
      return
    }
    loadData()
  }, [role, departmentId])

  async function loadData() {
    try {
      setLoading(true)
      const query = supabase.from('activity_log').select(`
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        timestamp,
        user:users!user_id(id, name, avatar_url)
      `)

      if (role === 'dept_lead') {
        const { data: deptUserIds } = await supabase
          .from('users')
          .select('id')
          .eq('department_id', departmentId)
        const ids = (deptUserIds || []).map((u) => u.id)
        if (ids.length > 0) {
          query.in('user_id', ids)
        }
      }

      const { data: logsData, error } = await query.order('timestamp', { ascending: false })

      if (error) throw error

      setAllLogs(logsData || [])
      setLogs(logsData || [])

      const distinctUsers = Array.from(
        new Map((logsData || []).map((log) => [log.user_id, log.user])).values()
      ).sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
      setUsers(distinctUsers)

      const distinctActions = [...new Set((logsData || []).map((log) => log.action))].sort()
      setActions(distinctActions)

      const distinctTypes = [
        'All',
        ...Array.from(new Set((logsData || []).map((log) => log.entity_type))).sort(),
      ]
      setEntityTypes(distinctTypes)

      setPagination({ page: 1, perPage: ROWS_PER_PAGE })
    } catch (err) {
      console.error('Error loading activity log:', err)
    } finally {
      setLoading(false)
    }
  }

  function applyFilters() {
    let filtered = [...allLogs]

    if (filters.fromDate) {
      const fromTime = new Date(filters.fromDate).getTime()
      filtered = filtered.filter((log) => new Date(log.timestamp).getTime() >= fromTime)
    }

    if (filters.toDate) {
      const toDate = new Date(filters.toDate)
      toDate.setHours(23, 59, 59, 999)
      const toTime = toDate.getTime()
      filtered = filtered.filter((log) => new Date(log.timestamp).getTime() <= toTime)
    }

    if (filters.userId) {
      filtered = filtered.filter((log) => log.user_id === filters.userId)
    }

    if (filters.action) {
      filtered = filtered.filter((log) => log.action === filters.action)
    }

    if (filters.entityType !== 'All') {
      filtered = filtered.filter((log) => log.entity_type === filters.entityType)
    }

    setLogs(filtered)
    setPagination({ page: 1, perPage: ROWS_PER_PAGE })
  }

  function clearFilters() {
    setFilters({
      fromDate: '',
      toDate: '',
      userId: '',
      action: '',
      entityType: 'All',
    })
    setLogs(allLogs)
    setPagination({ page: 1, perPage: ROWS_PER_PAGE })
  }

  async function handleExportCSV() {
    try {
      setExporting(true)

      let toExport = [...logs]
      if (toExport.length > 1000) {
        toExport = toExport.slice(0, 1000)
      }

      const headers = ['Date', 'Time', 'Actor', 'Action', 'Entity Type', 'Entity ID']
      const rows = toExport.map((log) => {
        const date = new Date(log.timestamp)
        const dateStr = date.toLocaleDateString('en-US')
        const timeStr = date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
        return [
          dateStr,
          timeStr,
          log.user?.name || 'Unknown',
          ACTION_LABELS[log.action] || log.action,
          ENTITY_TYPE_LABELS[log.entity_type] || log.entity_type,
          log.entity_id || '',
        ]
      })

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute(
        'download',
        `activity-log-${new Date().toISOString().split('T')[0]}.csv`
      )
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Error exporting CSV:', err)
    } finally {
      setExporting(false)
    }
  }

  const pageCount = Math.ceil(logs.length / ROWS_PER_PAGE)
  const startIdx = (pagination.page - 1) * ROWS_PER_PAGE
  const endIdx = Math.min(startIdx + ROWS_PER_PAGE, logs.length)
  const pageLogsData = logs.slice(startIdx, endIdx)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F4F1EA' }}>
      <div style={{ padding: '32px 40px', borderBottom: '1px solid #EDE8DC' }}>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: '#2D2A22',
            margin: '0 0 24px',
          }}
        >
          Activity Log
        </h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#6B6360' }}>
              From
            </label>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D9D1C3',
                borderRadius: 6,
                fontSize: 13,
                background: '#FFFFFF',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#6B6360' }}>
              To
            </label>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D9D1C3',
                borderRadius: 6,
                fontSize: 13,
                background: '#FFFFFF',
              }}
            />
          </div>

          {role === 'super_admin' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#6B6360' }}>
                User
              </label>
              <select
                value={filters.userId}
                onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D9D1C3',
                  borderRadius: 6,
                  fontSize: 13,
                  background: '#FFFFFF',
                }}
              >
                <option value="">All Users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#6B6360' }}>
              Action
            </label>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D9D1C3',
                borderRadius: 6,
                fontSize: 13,
                background: '#FFFFFF',
              }}
            >
              <option value="">All Actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a] || a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#6B6360' }}>
              Entity Type
            </label>
            <select
              value={filters.entityType}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D9D1C3',
                borderRadius: 6,
                fontSize: 13,
                background: '#FFFFFF',
              }}
            >
              {entityTypes.map((t) => (
                <option key={t} value={t}>
                  {ENTITY_TYPE_LABELS[t] || t}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={applyFilters}
            style={{
              padding: '8px 16px',
              background: '#4C2A92',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Apply
          </button>

          <button
            onClick={clearFilters}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: '#4C2A92',
              border: '1px solid #D9D1C3',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 40px', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: '#6B6360' }}>
            Showing {logs.length === 0 ? 0 : startIdx + 1}–{endIdx} of {logs.length} entries
          </span>
          <button
            onClick={handleExportCSV}
            disabled={exporting || logs.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: exporting ? '#E9E4D8' : '#FFFFFF',
              color: exporting ? '#9E9488' : '#4C2A92',
              border: '1px solid #D9D1C3',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: exporting ? 'default' : 'pointer',
            }}
          >
            <Download size={14} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9E9488' }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9E9488' }}>
            No activity log entries found.
          </div>
        ) : (
          <>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                background: '#FFFFFF',
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid #EDE8DC',
              }}
            >
              <thead>
                <tr style={{ background: '#F4F1EA', borderBottom: '1px solid #EDE8DC' }}>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#2D2A22',
                      width: '25%',
                    }}
                  >
                    Actor
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#2D2A22',
                      width: '25%',
                    }}
                  >
                    Action
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#2D2A22',
                      width: '25%',
                    }}
                  >
                    Entity
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#2D2A22',
                      width: '25%',
                    }}
                  >
                    Date & Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageLogsData.map((log) => (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: '1px solid #EDE8DC',
                      background: '#FFFFFF',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F1' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF' }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#2D2A22' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: '#4C2A92',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(log.user?.name)}
                        </div>
                        <span>{log.user?.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#2D2A22' }}>
                      {ACTION_LABELS[log.action] || log.action}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#2D2A22' }}>
                      {ENTITY_TYPE_LABELS[log.entity_type] || log.entity_type}
                      {log.entity_id && ` · ${log.entity_id.slice(0, 8)}...`}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#2D2A22' }}>
                      {formatDateTime(log.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pageCount > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 24,
                }}
              >
                <button
                  onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                  disabled={pagination.page === 1}
                  style={{
                    width: 32,
                    height: 32,
                    border: '1px solid #D9D1C3',
                    background: pagination.page === 1 ? '#F4F1EA' : '#FFFFFF',
                    borderRadius: 4,
                    cursor: pagination.page === 1 ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: pagination.page === 1 ? '#B0A696' : '#2D2A22',
                  }}
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => setPagination({ ...pagination, page: pageNum })}
                    style={{
                      minWidth: 32,
                      height: 32,
                      border:
                        pageNum === pagination.page ? '1px solid #4C2A92' : '1px solid #D9D1C3',
                      background: pageNum === pagination.page ? '#EDE8F8' : '#FFFFFF',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      color: pageNum === pagination.page ? '#4C2A92' : '#2D2A22',
                    }}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                  disabled={pagination.page === pageCount}
                  style={{
                    width: 32,
                    height: 32,
                    border: '1px solid #D9D1C3',
                    background: pagination.page === pageCount ? '#F4F1EA' : '#FFFFFF',
                    borderRadius: 4,
                    cursor: pagination.page === pageCount ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: pagination.page === pageCount ? '#B0A696' : '#2D2A22',
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
