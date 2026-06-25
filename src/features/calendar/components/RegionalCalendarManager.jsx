import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dropdown-menu'
import { MoreVertical, Plus, Trash2, RefreshCw } from 'lucide-react'
import { createRegionalCalendarSync, getRegionalCalendarSyncs, syncRegionalCalendar, disconnectRegionalCalendar } from '..'

export default function RegionalCalendarManager({ orgId }) {
  const [syncs, setSyncs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(null)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    regional_calendar_name: '',
    regional_calendar_url: '',
    sync_direction: 'from_google',
    color: '#FF6B6B',
    description: '',
  })

  useEffect(() => {
    loadSyncs()
  }, [orgId])

  async function loadSyncs() {
    try {
      setLoading(true)
      const data = await getRegionalCalendarSyncs(orgId)
      setSyncs(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!formData.regional_calendar_name.trim() || !formData.regional_calendar_url.trim()) {
      setError('Calendar name and URL are required')
      return
    }

    setSaving(true)
    setError('')
    try {
      await createRegionalCalendarSync({ org_id: orgId, ...formData })
      await loadSyncs()
      setShowAddDialog(false)
      setFormData({
        regional_calendar_name: '',
        regional_calendar_url: '',
        sync_direction: 'from_google',
        color: '#FF6B6B',
        description: '',
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSync(syncId) {
    setSyncing(syncId)
    try {
      const result = await syncRegionalCalendar(syncId)
      alert(`✓ Synced ${result.synced} events`)
      await loadSyncs()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(null)
    }
  }

  async function handleDisconnect(syncId) {
    if (!window.confirm('Disconnect this regional calendar? Events will be removed.')) return

    try {
      await disconnectRegionalCalendar(syncId)
      await loadSyncs()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="p-4 text-center">Loading regional calendars...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">🌍 Regional Ministry Calendars</h3>
          <p className="text-sm text-[var(--text-secondary)]">Sync calendars from regional offices and affiliates</p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-2 rounded-lg bg-[#4C2A92] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} />
          Add Regional Calendar
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--coral)] bg-[var(--coral-light)] p-3 text-sm text-[var(--coral-dark)]">
          {error}
        </div>
      )}

      {syncs.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] p-8 text-center">
          <p className="text-[var(--text-secondary)]">No regional calendars connected yet</p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">Import calendars via iCal URLs to sync events</p>
        </div>
      ) : (
        <div className="space-y-3">
          {syncs.map((sync) => (
            <div
              key={sync.id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white p-4"
            >
              <div className="flex items-center gap-3 flex-1">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ background: sync.color }}
                />
                <div className="flex-1">
                  <div className="font-medium text-[var(--text-primary)]">{sync.regional_calendar_name}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {sync.sync_direction === 'from_google' && '← Pull from regional calendar'}
                    {sync.sync_direction === 'to_google' && '→ Push to regional calendar'}
                    {sync.sync_direction === 'both' && '↔️ Two-way sync'}
                  </div>
                  {sync.description && (
                    <p className="text-xs text-[var(--text-tertiary)]">{sync.description}</p>
                  )}
                  {sync.last_synced_at && (
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      Last synced: {new Date(sync.last_synced_at).toLocaleString()} ({sync.synced_count} events)
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSync(sync.id)}
                  disabled={syncing === sync.id}
                  className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                  title="Sync now"
                >
                  <RefreshCw size={16} className={syncing === sync.id ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => handleDisconnect(sync.id)}
                  className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--coral)]"
                  title="Disconnect"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6">
            <h3 className="text-lg font-semibold">Add Regional Calendar</h3>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]">Calendar Name *</label>
              <input
                type="text"
                value={formData.regional_calendar_name}
                onChange={(e) => setFormData({ ...formData, regional_calendar_name: e.target.value })}
                placeholder="e.g., Greater Toronto Ministry Calendar"
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]">Calendar URL (iCal) *</label>
              <input
                type="url"
                value={formData.regional_calendar_url}
                onChange={(e) => setFormData({ ...formData, regional_calendar_url: e.target.value })}
                placeholder="https://calendar.example.com/feed.ics"
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Public iCal (ICS) URL for the regional calendar</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]">Sync Direction</label>
              <select
                value={formData.sync_direction}
                onChange={(e) => setFormData({ ...formData, sync_direction: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="from_google">← Pull from regional calendar</option>
                <option value="to_google">→ Push to regional calendar</option>
                <option value="both">↔️ Two-way sync</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]">Color</label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Notes about this calendar..."
                rows="2"
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowAddDialog(false)}
                className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 rounded-lg bg-[#4C2A92] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Calendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
