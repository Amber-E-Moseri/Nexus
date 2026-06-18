import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  ACTIVITY_ENTITY_OPTIONS,
  formatActivityDateTime,
  getActivityActionLabel,
  getActivityEntityPath,
  getActivityEntityText,
  getActivityInitials,
} from '../lib/activityLog'
import { supabase } from '../lib/supabase'

const ROWS_PER_PAGE = 50

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #D9D1C3',
  borderRadius: 8,
  fontSize: 13,
  background: '#FFFFFF',
  color: '#2D2A22',
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
  color: '#6B6360',
}

function buildLogsQuery({ userIds, filters, count = false }) {
  let query = supabase
    .from('activity_log')
    .select(
      `
      id,
      user_id,
      action,
      entity_type,
      entity_id,
      timestamp,
      user:users!user_id(id, name, department_id, avatar_url)
    `,
      count ? { count: 'exact' } : undefined,
    )
    .order('timestamp', { ascending: false })

  if (userIds) {
    query = userIds.length > 0 ? query.in('user_id', userIds) : query.eq('user_id', '00000000-0000-0000-0000-000000000000')
  }

  if (filters.fromDate) {
    query = query.gte('timestamp', `${filters.fromDate}T00:00:00`)
  }

  if (filters.toDate) {
    query = query.lte('timestamp', `${filters.toDate}T23:59:59.999`)
  }

  if (filters.userId) {
    query = query.eq('user_id', filters.userId)
  }

  if (filters.action) {
    query = query.eq('action', filters.action)
  }

  if (filters.entityType && filters.entityType !== 'All') {
    query = query.eq('entity_type', filters.entityType)
  }

  return query
}

export default function ActivityLogPage() {
  const navigate = useNavigate()
  const { role, profile } = useAuth()
  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [accessibleUserIds, setAccessibleUserIds] = useState(null)
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    userId: '',
    action: '',
    entityType: 'All',
  })
  const [appliedFilters, setAppliedFilters] = useState({
    fromDate: '',
    toDate: '',
    userId: '',
    action: '',
    entityType: 'All',
  })

  useEffect(() => {
    if (role && role !== 'super_admin' && role !== 'dept_lead') {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate, role])

  useEffect(() => {
    let active = true

    async function loadFilterOptions() {
      if (!role) return

      const departmentId = profile?.department_id ?? null
      const usersQuery = supabase
        .from('users')
        .select('id, name, department_id')
        .order('name')

      const scopedUsersQuery = role === 'dept_lead' && departmentId
        ? usersQuery.eq('department_id', departmentId)
        : usersQuery

      const { data: userRows, error: usersError } = await scopedUsersQuery
      if (usersError) throw usersError

      const nextUsers = userRows ?? []
      const nextUserIds = role === 'dept_lead' ? nextUsers.map((entry) => entry.id) : null

      let actionQuery = supabase
        .from('activity_log')
        .select('action')
        .order('timestamp', { ascending: false })
        .limit(1000)

      if (nextUserIds) {
        actionQuery = nextUserIds.length > 0 ? actionQuery.in('user_id', nextUserIds) : actionQuery.eq('user_id', '00000000-0000-0000-0000-000000000000')
      }

      const { data: actionRows, error: actionsError } = await actionQuery
      if (actionsError) throw actionsError

      if (!active) return

      setUsers(nextUsers)
      setAccessibleUserIds(nextUserIds)
      setActions(Array.from(new Set((actionRows ?? []).map((entry) => entry.action).filter(Boolean))).sort())
    }

    loadFilterOptions().catch((error) => {
      console.error('Failed to load activity log filters', error)
      if (!active) return
      setUsers([])
      setAccessibleUserIds(role === 'dept_lead' ? [] : null)
      setActions([])
    })

    return () => {
      active = false
    }
  }, [profile?.department_id, role])

  useEffect(() => {
    let active = true

    async function loadLogs() {
      if (!role || accessibleUserIds === undefined) return
      setLoading(true)

      try {
        const from = (page - 1) * ROWS_PER_PAGE
        const to = from + ROWS_PER_PAGE - 1
        const query = buildLogsQuery({
          userIds: role === 'dept_lead' ? accessibleUserIds ?? [] : null,
          filters: appliedFilters,
          count: true,
        }).range(from, to)

        const { data, count, error } = await query
        if (error) throw error

        if (!active) return
        setRows(data ?? [])
        setTotalCount(count ?? 0)
      } catch (error) {
        console.error('Failed to load activity log rows', error)
        if (!active) return
        setRows([])
        setTotalCount(0)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadLogs()

    return () => {
      active = false
    }
  }, [accessibleUserIds, appliedFilters, page, role])

  const pageCount = Math.max(1, Math.ceil(totalCount / ROWS_PER_PAGE))
  const startIndex = totalCount === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1
  const endIndex = Math.min(page * ROWS_PER_PAGE, totalCount)
  const pageNumbers = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount])

  function applyFilters() {
    setAppliedFilters(filters)
    setPage(1)
  }

  function clearFilters() {
    const empty = {
      fromDate: '',
      toDate: '',
      userId: '',
      action: '',
      entityType: 'All',
    }
    setFilters(empty)
    setAppliedFilters(empty)
    setPage(1)
  }

  async function handleExportCSV() {
    try {
      setExporting(true)
      const query = buildLogsQuery({
        userIds: role === 'dept_lead' ? accessibleUserIds ?? [] : null,
        filters: appliedFilters,
      }).range(0, 999)

      const { data, error } = await query
      if (error) throw error

      const headers = ['Date', 'Time', 'Actor', 'Action', 'Entity Type', 'Entity ID']
      const lines = (data ?? []).map((entry) => {
        const date = new Date(entry.timestamp)
        const datePart = date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        const timePart = date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })

        return [
          datePart,
          timePart,
          entry.user?.name ?? 'Unknown',
          getActivityActionLabel(entry.action),
          entry.entity_type ?? '',
          entry.entity_id ?? '',
        ]
      })

      const csv = [
        headers.join(','),
        ...lines.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export activity log', error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ flex: 1, background: '#F4F1EA', minHeight: '100%' }}>
      <div style={{ padding: '32px 40px 24px', borderBottom: '1px solid #EDE8DC' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 700, color: '#2D2A22', margin: 0 }}>Activity Log</h1>
          </div>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={exporting || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #D9D1C3',
              background: '#FFFFFF',
              color: '#4C2A92',
              fontSize: 13,
              fontWeight: 700,
              cursor: exporting || loading ? 'default' : 'pointer',
              opacity: exporting || loading ? 0.7 : 1,
            }}
          >
            <Download size={14} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <label htmlFor="activity-from-date" style={labelStyle}>From</label>
            <input
              id="activity-from-date"
              type="date"
              value={filters.fromDate}
              onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="activity-to-date" style={labelStyle}>To</label>
            <input
              id="activity-to-date"
              type="date"
              value={filters.toDate}
              onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="activity-user" style={labelStyle}>User</label>
            <select
              id="activity-user"
              value={filters.userId}
              onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))}
              style={inputStyle}
            >
              <option value="">All users</option>
              {users.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="activity-action" style={labelStyle}>Action type</label>
            <select
              id="activity-action"
              value={filters.action}
              onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
              style={inputStyle}
            >
              <option value="">All actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>{getActivityActionLabel(action)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="activity-entity" style={labelStyle}>Entity type</label>
            <select
              id="activity-entity"
              value={filters.entityType}
              onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value }))}
              style={inputStyle}
            >
              {ACTIVITY_ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={applyFilters}
            style={{
              padding: '10px 14px',
              background: '#4C2A92',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={clearFilters}
            style={{
              padding: '10px 0',
              background: 'transparent',
              color: '#4C2A92',
              border: 'none',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 40px 36px' }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: '#6B6360' }}>
          Showing {startIndex}-{endIndex} of {totalCount} entries
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9E9488' }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9E9488', background: '#FFFFFF', border: '1px solid #EDE8DC', borderRadius: 12 }}>
            No activity log entries found.
          </div>
        ) : (
          <>
            <div style={{ overflow: 'hidden', borderRadius: 12, border: '1px solid #EDE8DC', background: '#FFFFFF' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F4F1EA', borderBottom: '1px solid #EDE8DC' }}>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#2D2A22' }}>Actor</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#2D2A22' }}>Action</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#2D2A22' }}>Entity</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#2D2A22' }}>Date &amp; time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const entityPath = getActivityEntityPath(entry)
                    return (
                      <tr key={entry.id} style={{ borderBottom: '1px solid #EDE8DC' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 999,
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
                              {getActivityInitials(entry.user?.name ?? '')}
                            </div>
                            <span>{entry.user?.name ?? 'Unknown'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>
                          {getActivityActionLabel(entry.action)}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>
                          {entityPath ? (
                            <Link to={entityPath} style={{ color: '#4C2A92', textDecoration: 'underline' }}>
                              {getActivityEntityText(entry)}
                            </Link>
                          ) : (
                            getActivityEntityText(entry)
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>
                          {formatActivityDateTime(entry.timestamp)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {pageCount > 1 ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: '1px solid #D9D1C3',
                    background: '#FFFFFF',
                    color: page === 1 ? '#B0A696' : '#2D2A22',
                    cursor: page === 1 ? 'default' : 'pointer',
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    style={{
                      minWidth: 34,
                      height: 34,
                      padding: '0 10px',
                      borderRadius: 8,
                      border: `1px solid ${pageNumber === page ? '#4C2A92' : '#D9D1C3'}`,
                      background: pageNumber === page ? '#EDE8F8' : '#FFFFFF',
                      color: pageNumber === page ? '#4C2A92' : '#2D2A22',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={page === pageCount}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: '1px solid #D9D1C3',
                    background: '#FFFFFF',
                    color: page === pageCount ? '#B0A696' : '#2D2A22',
                    cursor: page === pageCount ? 'default' : 'pointer',
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
