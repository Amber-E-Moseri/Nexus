import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import MiFilterBar from '../../features/reporting/components/MiFilterBar'
import MiDashboardView from '../../features/reporting/views/MiDashboardView'
import MiHierarchyView from '../../features/reporting/views/MiHierarchyView'
import MiTrendsView from '../../features/reporting/views/MiTrendsView'
import MiReportsView from '../../features/reporting/views/MiReportsView'
import { fetchSyncLog } from '../../features/reporting/lib/miApi'
import { getDateRange } from '../../features/reporting/lib/miHelpers'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'hierarchy', label: 'Hierarchy' },
  { id: 'trends', label: 'Trends' },
  { id: 'reports', label: 'Reports' },
]

const STYLES = `
  .mi-page-header {
    background: #fff;
    border-bottom: 0.5px solid #EDE8DC;
    padding: 20px 28px 0;
  }
  .mi-page-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .mi-tabs {
    display: flex;
    gap: 0;
  }
  .mi-tab-btn {
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 500;
    color: #9E9488;
    border: none;
    background: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
    font-family: inherit;
    white-space: nowrap;
  }
  .mi-tab-btn.active {
    color: #4C2A92;
    border-bottom-color: #4C2A92;
  }
  .mi-tab-btn:hover:not(.active) {
    color: #2D2A22;
  }
  .mi-page-content {
    padding: 24px 28px;
    max-width: 1100px;
  }
  .mi-sync-meta {
    font-size: 11px;
    color: #BFBAB0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mi-refresh-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border: 0.5px solid #EDE8DC;
    border-radius: 6px;
    background: #fff;
    color: #9E9488;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.1s, color 0.1s;
  }
  .mi-refresh-btn:hover {
    border-color: #4C2A92;
    color: #4C2A92;
  }
  .mi-refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (max-width: 640px) {
    .mi-page-header { padding: 16px 16px 0; }
    .mi-page-content { padding: 16px; }
    .mi-tab-btn { padding: 10px 12px; font-size: 12px; }
  }
`

export default function ReportingPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [timeWindow, setTimeWindow] = useState('6m')
  const [customDateFrom, setCustomDateFrom] = useState(null)
  const [customDateTo, setCustomDateTo] = useState(null)
  const [eventType, setEventType] = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (profile && profile.role !== 'super_admin') {
      window.location.href = '/'
    }
  }, [profile])

  const { data: syncLog } = useQuery({
    queryKey: ['mi_sync_log'],
    queryFn: fetchSyncLog,
    staleTime: 60 * 1000,
  })

  if (!profile || profile.role !== 'super_admin') return null

  const { dateFrom, dateTo } = getDateRange(timeWindow, customDateFrom, customDateTo)

  const handleTimeWindowChange = (window) => {
    setTimeWindow(window)
  }

  const handleDateChange = ({ dateFrom: from, dateTo: to }) => {
    setCustomDateFrom(from)
    setCustomDateTo(to)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const { data, error } = await supabase.functions.invoke('mi-sync', { method: 'POST' })
      if (error) {
        console.error('[mi-sync] invoke error:', error)
        alert(`Sync failed: ${error.message}`)
        return
      }
      if (data?.status === 'error') {
        alert(`Sync error: ${data.error}`)
        return
      }
      await queryClient.invalidateQueries()
    } finally {
      setRefreshing(false)
    }
  }

  const syncedAt = syncLog?.finished_at
    ? new Date(syncLog.finished_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
      <style>{STYLES}</style>

      <div className="mi-page-header">
        <div className="mi-page-title-row">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 3px', color: '#2D2A22' }}>Reporting</h1>
            <div className="mi-sync-meta">
              {syncedAt ? `Last synced ${syncedAt}` : 'Never synced'}
              {syncLog?.status === 'error' && (
                <span style={{ color: '#C94830' }}>⚠ Last sync failed</span>
              )}
            </div>
          </div>
          <button
            className="mi-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
            {refreshing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>

        <nav className="mi-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`mi-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mi-page-content">
        <MiFilterBar
          timeWindow={timeWindow}
          onTimeWindowChange={handleTimeWindowChange}
          customDateFrom={customDateFrom}
          customDateTo={customDateTo}
          onDateChange={handleDateChange}
          eventType={eventType}
          onEventTypeChange={setEventType}
        />

        {activeTab === 'dashboard' && (
          <MiDashboardView
            dateFrom={dateFrom}
            dateTo={dateTo}
            eventType={eventType}
          />
        )}
        {activeTab === 'hierarchy' && (
          <MiHierarchyView
            dateFrom={dateFrom}
            dateTo={dateTo}
            eventType={eventType}
          />
        )}
        {activeTab === 'trends' && (
          <MiTrendsView
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        )}
        {activeTab === 'reports' && (
          <MiReportsView
            dateFrom={dateFrom}
            dateTo={dateTo}
            eventType={eventType}
          />
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
