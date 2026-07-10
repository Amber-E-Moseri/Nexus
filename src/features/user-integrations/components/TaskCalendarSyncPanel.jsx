import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import {
  getMyGoogleCalendarConnection,
  setSyncTasksEnabled,
  syncMyTasksToGoogleCalendar,
} from '../../calendar/lib/calendar'

export default function TaskCalendarSyncPanel() {
  const { profile } = useAuth()
  const [connection, setConnection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    load()
  }, [profile?.id])

  async function load() {
    try {
      setLoading(true)
      const data = await getMyGoogleCalendarConnection(profile.id)
      setConnection(data)
    } catch (err) {
      console.error('Failed to load Google Calendar connection:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle() {
    if (!connection || toggling) return
    setToggling(true)
    setError(null)
    try {
      const next = !connection.sync_tasks_enabled
      await setSyncTasksEnabled(profile.id, next)
      setConnection({ ...connection, sync_tasks_enabled: next })
    } catch (err) {
      setError(err.message || 'Failed to update setting')
    } finally {
      setToggling(false)
    }
  }

  async function handleSyncNow() {
    if (!connection?.sync_tasks_enabled || syncing) return
    setSyncing(true)
    setError(null)
    setResult(null)
    try {
      const data = await syncMyTasksToGoogleCalendar(profile.id)
      setResult(data)
      await load()
    } catch (err) {
      setError(err.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return null
  if (!connection) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-hover)] p-4 text-sm text-[var(--text-secondary)]">
        Connect Google Calendar above to sync your tasks.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-medium text-[var(--text-primary)]">Sync my tasks to Google Calendar</h4>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Pushes tasks assigned to you, and tasks you follow, onto your Google Calendar as
            all-day events on their due date. One-way — changes in Google Calendar don't sync back.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={connection.sync_tasks_enabled}
          onClick={handleToggle}
          disabled={toggling}
          className="shrink-0"
          style={{
            width: 40,
            height: 22,
            borderRadius: 999,
            border: 'none',
            padding: 2,
            background: connection.sync_tasks_enabled ? 'var(--accent)' : '#D9D9E3',
            cursor: toggling ? 'default' : 'pointer',
            opacity: toggling ? 0.6 : 1,
            transition: 'background 0.15s',
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'white',
              transform: connection.sync_tasks_enabled ? 'translateX(18px)' : 'translateX(0)',
              transition: 'transform 0.15s',
            }}
          />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSyncNow}
          disabled={!connection.sync_tasks_enabled || syncing}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync now'}
        </button>
        {connection.last_synced_at && (
          <span className="text-xs text-[var(--text-tertiary)]">
            Last synced: {new Date(connection.last_synced_at).toLocaleString()}
          </span>
        )}
      </div>

      {result && (
        <p className="text-xs text-green-700">
          Created {result.created}, updated {result.updated}, removed {result.deleted}
          {result.errors ? `, ${result.errors} failed` : ''}.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
