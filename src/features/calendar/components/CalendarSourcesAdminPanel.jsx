import { useEffect, useState } from 'react'
import { CalendarPlus, RefreshCw, Trash2, Link as LinkIcon } from 'lucide-react'
import {
  getMinistryCalendarConnectionStatus,
  getMinistryCalendarConnectOAuthUrl,
  listAvailableCalendarSources,
  getMinistryCalendarSources,
  addCalendarSource,
  updateCalendarSource,
  removeCalendarSource,
  syncCalendarSource,
} from '../lib/calendar'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../context/ToastContext'
import Toggle from './Toggle'

// Admin panel for the Ministry Calendar's shared Google connection and the
// sources synced through it (org calendar, Birthdays, Holidays, etc). Modeled
// on CalendarSettingsPanel's layout — header bar + card sections.
export default function CalendarSourcesAdminPanel() {
  const { profile } = useAuth()
  const { showToast } = useToast()

  const [connected, setConnected] = useState(null) // null = unknown/loading
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [picker, setPicker] = useState(null) // available calendars, or null if picker closed
  const [pickerLoading, setPickerLoading] = useState(false)
  const [busySourceId, setBusySourceId] = useState(null)
  const [needs_reauth, setNeedsReauth] = useState(false)

  function isReauthRequiredError(err) {
    return err?.message?.includes('reauth_required')
  }

  async function load() {
    setLoading(true)
    try {
      const [connection, sourceRows] = await Promise.all([
        getMinistryCalendarConnectionStatus(),
        getMinistryCalendarSources(),
      ])
      setConnected(!!connection)
      setNeedsReauth(connection?.needs_reauth ?? false)
      setSources(sourceRows)
    } catch (err) {
      console.error('Failed to load Ministry Calendar sources:', err)
      showToast('Failed to load calendar sources', { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleConnect() {
    window.location.href = getMinistryCalendarConnectOAuthUrl()
  }

  async function handleOpenPicker() {
    setPickerLoading(true)
    try {
      const calendars = await listAvailableCalendarSources()
      setNeedsReauth(false)
      setPicker(calendars)
    } catch (err) {
      if (isReauthRequiredError(err)) {
        setNeedsReauth(true)
        showToast('Google connection expired. Reconnect the account to continue.', { tone: 'error' })
        return
      }
      showToast(err.message || 'Failed to list calendars', { tone: 'error' })
    } finally {
      setPickerLoading(false)
    }
  }

  async function handleAddCalendar(cal) {
    try {
      await addCalendarSource({
        googleCalendarId: cal.id,
        displayName: cal.summary,
        color: cal.background_color,
        pushEnabled: false,
        createdBy: profile?.id ?? null,
      })
      showToast(`Added ${cal.summary}`, { tone: 'success' })
      setPicker(null)
      await load()
    } catch (err) {
      showToast(err.message || 'Failed to add calendar', { tone: 'error' })
    }
  }

  async function handleRemove(source) {
    if (!window.confirm(`Remove "${source.display_name}"? Its synced events will remain but become un-synced.`)) return
    setBusySourceId(source.id)
    try {
      await removeCalendarSource(source.id)
      showToast('Source removed', { tone: 'success' })
      await load()
    } catch (err) {
      showToast(err.message || 'Failed to remove source', { tone: 'error' })
    } finally {
      setBusySourceId(null)
    }
  }

  async function handleSyncNow(source) {
    setBusySourceId(source.id)
    try {
      const result = await syncCalendarSource(source.id)
      setNeedsReauth(false)
      showToast(`Synced — ${result.created ?? 0} created, ${result.updated ?? 0} updated, ${result.pulled ?? 0} pulled`, { tone: 'success' })
      await load()
    } catch (err) {
      if (isReauthRequiredError(err)) {
        setNeedsReauth(true)
        showToast('Google connection expired. Reconnect the account to sync again.', { tone: 'error' })
        return
      }
      showToast(err.message || 'Sync failed', { tone: 'error' })
    } finally {
      setBusySourceId(null)
    }
  }

  async function handleTogglePush(source) {
    setBusySourceId(source.id)
    try {
      // Server rejects a second push_enabled=true via a partial unique
      // index (409) — surfaced through the catch below.
      await updateCalendarSource(source.id, { push_enabled: !source.push_enabled })
      await load()
    } catch (err) {
      showToast(err.message || 'Failed to update source', { tone: 'error' })
    } finally {
      setBusySourceId(null)
    }
  }

  return (
    <div style={{
      borderRadius: '12px',
      border: '1px solid var(--border)',
      backgroundColor: 'white',
      overflow: 'hidden',
      boxShadow: 'var(--card-shadow)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface-tertiary)',
      }}>
        <LinkIcon size={18} style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Ministry Calendar Sources
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            Connect a Google account and add calendars (Birthdays, Holidays, the main org calendar) to sync in.
          </p>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Loading...
          </div>
        ) : !connected ? (
          <button
            onClick={handleConnect}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 16px', borderRadius: '8px', border: 'none',
              backgroundColor: 'var(--accent)', color: 'white',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <LinkIcon size={14} /> Connect Google Account
          </button>
        ) : (
          <>
            {needs_reauth && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginBottom: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #F59E0B',
                  backgroundColor: '#FFFBEB',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#B45309' }}>
                    Google connection needs attention
                  </div>
                  <div style={{ fontSize: '12px', color: '#92400E', marginTop: '2px' }}>
                    The stored Google authorization has expired. Reconnect before syncing or adding calendars.
                  </div>
                </div>
                <button
                  onClick={handleConnect}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#D97706',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <LinkIcon size={13} /> Reconnect Google
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>✓ Google account connected</div>
              <button
                onClick={handleOpenPicker}
                disabled={pickerLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)',
                  backgroundColor: 'white', color: 'var(--text-primary)',
                  fontSize: '12px', fontWeight: 600, cursor: pickerLoading ? 'not-allowed' : 'pointer',
                }}
              >
                <CalendarPlus size={13} /> {pickerLoading ? 'Loading...' : 'Add a calendar'}
              </button>
            </div>

            {picker && (
              <div style={{
                marginBottom: '12px', padding: '10px', borderRadius: '8px',
                border: '1px solid var(--border)', backgroundColor: 'var(--surface-tertiary)',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Pick a calendar to add
                </div>
                {picker.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No calendars found on this account.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {picker.map((cal) => {
                      const alreadyAdded = sources.some((s) => s.google_calendar_id === cal.id)
                      return (
                        <div key={cal.id} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '6px 8px', borderRadius: '6px', backgroundColor: 'white', fontSize: '13px',
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: cal.background_color || 'var(--accent)', flexShrink: 0 }} />
                          <span style={{ flex: 1, color: 'var(--text-primary)' }}>{cal.summary}</span>
                          <button
                            onClick={() => handleAddCalendar(cal)}
                            disabled={alreadyAdded}
                            style={{
                              padding: '3px 10px', borderRadius: '5px', border: 'none',
                              backgroundColor: alreadyAdded ? '#E2DDD6' : '#D1FAE5',
                              color: alreadyAdded ? 'var(--text-tertiary)' : '#059669',
                              fontSize: '11px', fontWeight: 600,
                              cursor: alreadyAdded ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {alreadyAdded ? 'Added' : 'Add'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <button
                  onClick={() => setPicker(null)}
                  style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Close
                </button>
              </div>
            )}

            {sources.length === 0 ? (
              <div style={{
                padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-tertiary)',
                textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px',
              }}>
                No calendars added yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {sources.map((source) => (
                  <div key={source.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px', borderRadius: '8px', backgroundColor: 'var(--surface-tertiary)', fontSize: '13px',
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: source.color || 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{source.display_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {source.last_sync_error
                          ? <span style={{ color: '#DC2626' }}>Error: {source.last_sync_error}</span>
                          : source.last_synced_at
                            ? `Last synced ${new Date(source.last_synced_at).toLocaleString()}`
                            : 'Never synced'}
                        {source.is_read_only && ' · Read-only'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Push approved events to this calendar">
                      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Push</span>
                      <Toggle
                        checked={source.push_enabled}
                        disabled={busySourceId === source.id || source.is_read_only}
                        onChange={() => handleTogglePush(source)}
                        label={`Push approved events to ${source.display_name}`}
                      />
                    </div>

                    <button
                      onClick={() => handleSyncNow(source)}
                      disabled={busySourceId === source.id}
                      title="Sync now"
                      style={{
                        display: 'flex', alignItems: 'center', padding: '5px',
                        borderRadius: '6px', border: 'none', backgroundColor: 'white',
                        color: 'var(--text-secondary)', cursor: busySourceId === source.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <RefreshCw size={13} />
                    </button>

                    <button
                      onClick={() => handleRemove(source)}
                      disabled={busySourceId === source.id}
                      title="Remove"
                      style={{
                        display: 'flex', alignItems: 'center', padding: '5px',
                        borderRadius: '6px', border: 'none', backgroundColor: '#FEE2E2',
                        color: '#DC2626', cursor: busySourceId === source.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
