import { useEffect, useState, useCallback } from 'react'
import { CalendarPlus, RefreshCw, Trash2, Link as LinkIcon, Users, Tag, ChevronDown, ChevronUp } from 'lucide-react'
import {
  getMinistryCalendarConnectionStatus,
  getMinistryCalendarConnectOAuthUrl,
  disconnectMinistryCalendar,
  listAvailableCalendarSources,
  getMinistryCalendarSources,
  addCalendarSource,
  updateCalendarSource,
  removeCalendarSource,
  syncCalendarSource,
} from '../lib/calendar'
import { supabase } from '../../../lib/supabase'
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
  const [disconnecting, setDisconnecting] = useState(false)

  // Per-source dept visibility
  const [departments, setDepartments] = useState([])
  const [visibilityRows, setVisibilityRows] = useState([]) // { source_id, department_id }[]
  const [expandedSource, setExpandedSource] = useState(null) // source id with open visibility panel
  const [visibilityBusy, setVisibilityBusy] = useState(false)

  // Per-source event category
  const [eventTypes, setEventTypes] = useState([]) // { name, color }[]
  const [expandedCategory, setExpandedCategory] = useState(null) // source id with open category panel
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [pendingCategory, setPendingCategory] = useState({}) // { [sourceId]: suggestedType } — auto-suggest not yet saved

  const loadVisibility = useCallback(async () => {
    const [deptRes, visRes] = await Promise.all([
      supabase.from('departments').select('id, name, color').order('name'),
      supabase.from('ministry_calendar_source_dept_visibility').select('source_id, department_id'),
    ])
    setDepartments(deptRes.data ?? [])
    setVisibilityRows(visRes.data ?? [])
  }, [])

  const loadEventTypes = useCallback(async () => {
    const { data } = await supabase
      .from('calendar_event_types')
      .select('name, color')
      .order('sort_order')
    setEventTypes(data ?? [])
  }, [])

  async function handleSaveCategory(sourceId, eventType) {
    setCategoryBusy(true)
    try {
      const { error } = await supabase
        .from('ministry_calendar_sources')
        .update({ default_event_type: eventType })
        .eq('id', sourceId)
      if (error) throw new Error(error.message)
      setSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, default_event_type: eventType } : s))
      setPendingCategory((prev) => { const next = { ...prev }; delete next[sourceId]; return next })
      showToast('Category saved', { tone: 'success' })
    } catch (err) {
      showToast(err.message || 'Failed to save category', { tone: 'error' })
    } finally {
      setCategoryBusy(false)
    }
  }

  // Returns whether a dept is currently allowed to see a source.
  // No rows for a source = org-wide = all true.
  function isDeptAllowed(sourceId, deptId) {
    const restricted = visibilityRows.filter(r => r.source_id === sourceId)
    if (restricted.length === 0) return true // org-wide
    return restricted.some(r => r.department_id === deptId)
  }

  async function handleToggleDeptVisibility(sourceId, deptId, currentlyAllowed) {
    setVisibilityBusy(true)
    try {
      const restricted = visibilityRows.filter(r => r.source_id === sourceId)
      const isOrgWide = restricted.length === 0

      if (currentlyAllowed) {
        // Removing access from this dept
        if (isOrgWide) {
          // Was org-wide: insert rows for all OTHER depts, leaving this one out
          const others = departments.filter(d => d.id !== deptId)
          if (others.length > 0) {
            await supabase.from('ministry_calendar_source_dept_visibility')
              .upsert(others.map(d => ({ source_id: sourceId, department_id: d.id })), { onConflict: 'source_id,department_id' })
          }
        } else {
          // Already restricted: just remove this dept
          await supabase.from('ministry_calendar_source_dept_visibility')
            .delete().eq('source_id', sourceId).eq('department_id', deptId)
        }
      } else {
        // Granting access to this dept
        await supabase.from('ministry_calendar_source_dept_visibility')
          .upsert({ source_id: sourceId, department_id: deptId }, { onConflict: 'source_id,department_id' })

        // If all depts are now checked, delete all rows (back to org-wide)
        const newRows = visibilityRows.filter(r => !(r.source_id === sourceId && r.department_id === deptId))
        newRows.push({ source_id: sourceId, department_id: deptId })
        const nowAllowed = departments.every(d =>
          newRows.some(r => r.source_id === sourceId && r.department_id === d.id)
        )
        if (nowAllowed) {
          await supabase.from('ministry_calendar_source_dept_visibility')
            .delete().eq('source_id', sourceId)
        }
      }
      await loadVisibility()
    } catch (err) {
      showToast(err.message || 'Failed to update visibility', { tone: 'error' })
    } finally {
      setVisibilityBusy(false)
    }
  }

  async function handleMakeOrgWide(sourceId) {
    setVisibilityBusy(true)
    try {
      await supabase.from('ministry_calendar_source_dept_visibility')
        .delete().eq('source_id', sourceId)
      await loadVisibility()
    } finally {
      setVisibilityBusy(false)
    }
  }

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
    loadVisibility()
    loadEventTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleConnect() {
    window.location.href = getMinistryCalendarConnectOAuthUrl()
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Google Calendar? All synced sources will be removed.')) return

    setDisconnecting(true)
    try {
      await disconnectMinistryCalendar()
      await load()
      showToast('Google Calendar disconnected', { tone: 'success' })
    } catch (err) {
      showToast(err.message || 'Failed to disconnect', { tone: 'error' })
    } finally {
      setDisconnecting(false)
    }
  }

  function handleReconnect() {
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

      // Load fresh source list so we can find the new source's id
      const [connection, sourceRows] = await Promise.all([
        getMinistryCalendarConnectionStatus(),
        getMinistryCalendarSources(),
      ])
      setConnected(!!connection)
      setNeedsReauth(connection?.needs_reauth ?? false)
      setSources(sourceRows)

      // Auto-suggest category: check if calendar name contains an event type name
      const calNameLower = (cal.summary || '').toLowerCase()
      const match = eventTypes.find((et) => calNameLower.includes(et.name.toLowerCase()))
      if (match) {
        const newSource = sourceRows.find((s) => s.google_calendar_id === cal.id)
        if (newSource) {
          setPendingCategory((prev) => ({ ...prev, [newSource.id]: match.name }))
          setExpandedCategory(newSource.id)
        }
      }
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
        {!loading && !connected && (
          <div style={{
            marginBottom: '16px',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid #DBEAFE',
            backgroundColor: '#EFF6FF',
            fontSize: '13px',
            color: '#1E40AF',
            lineHeight: '1.5',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>ℹ️ Google Calendar is in testing mode</div>
            <div>Your Google account email must be added to the approved list to connect. If you can't sign in with Google, contact <strong>ORS</strong> — note that your Nexus email and Google account email may differ.</div>
          </div>
        )}

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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>✓ Google account connected</div>
              <div style={{ display: 'flex', gap: '8px' }}>
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
                  <CalendarPlus size={13} /> {pickerLoading ? 'Loading...' : 'Add calendar'}
                </button>
                <button
                  onClick={handleReconnect}
                  disabled={disconnecting}
                  title="Connect a different Google account"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)',
                    backgroundColor: 'white', color: 'var(--text-primary)',
                    fontSize: '12px', fontWeight: 600, cursor: disconnecting ? 'not-allowed' : 'pointer',
                    opacity: disconnecting ? 0.5 : 1,
                  }}
                >
                  <LinkIcon size={13} /> Reconnect
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  title="Disconnect Google Calendar"
                  style={{
                    padding: '6px 12px', borderRadius: '6px', border: '1px solid #FECACA',
                    backgroundColor: '#FEE2E2', color: '#DC2626',
                    fontSize: '12px', fontWeight: 600, cursor: disconnecting ? 'not-allowed' : 'pointer',
                    opacity: disconnecting ? 0.5 : 1,
                  }}
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
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
                {sources.map((source) => {
                  const isExpanded = expandedSource === source.id
                  const restricted = visibilityRows.filter(r => r.source_id === source.id)
                  const isOrgWide = restricted.length === 0
                  return (
                    <div key={source.id} style={{
                      borderRadius: '8px', backgroundColor: 'var(--surface-tertiary)',
                      border: '1px solid var(--border-light)', overflow: 'hidden',
                    }}>
                      {/* Source row */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px', fontSize: '13px',
                      }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: source.color || 'var(--accent)', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {source.display_name}
                            {/* Assigned category badge */}
                            {(() => {
                              const typeName = pendingCategory[source.id] || source.default_event_type
                              const et = typeName && eventTypes.find((t) => t.name === typeName)
                              if (!et || typeName === 'event') return null
                              return (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '1px 7px', borderRadius: '10px', backgroundColor: et.color + '22', border: `1px solid ${et.color}44`, fontSize: '10px', fontWeight: 600, color: et.color }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: et.color, flexShrink: 0 }} />
                                  {et.name}
                                  {pendingCategory[source.id] && ' *'}
                                </span>
                              )
                            })()}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {source.last_sync_error
                              ? <span style={{ color: '#DC2626' }}>Error: {source.last_sync_error}</span>
                              : source.last_synced_at
                                ? `Last synced ${new Date(source.last_synced_at).toLocaleString()}`
                                : 'Never synced'}
                            {source.is_read_only && ' · Read-only'}
                          </div>
                        </div>

                        {/* Who can see this */}
                        <button
                          onClick={() => setExpandedSource(isExpanded ? null : source.id)}
                          title="Configure which departments can see this calendar"
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)',
                            backgroundColor: isExpanded ? 'var(--accent-light)' : 'white',
                            color: isExpanded ? 'var(--accent)' : 'var(--text-secondary)',
                            fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          <Users size={11} />
                          {isOrgWide ? 'Everyone' : `${restricted.length} dept${restricted.length !== 1 ? 's' : ''}`}
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>

                        {/* Category */}
                        <button
                          onClick={() => setExpandedCategory(expandedCategory === source.id ? null : source.id)}
                          title="Map this calendar to an event category"
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)',
                            backgroundColor: expandedCategory === source.id ? 'var(--accent-light)' : 'white',
                            color: expandedCategory === source.id ? 'var(--accent)' : 'var(--text-secondary)',
                            fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          <Tag size={11} />
                          Category
                          {expandedCategory === source.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>

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

                      {/* Department visibility panel (expands below the row) */}
                      {isExpanded && (
                        <div style={{
                          padding: '10px 14px 12px',
                          borderTop: '1px solid var(--border-light)',
                          backgroundColor: 'white',
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                            Who can see this calendar
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                            {departments.map((dept) => {
                              const allowed = isDeptAllowed(source.id, dept.id)
                              return (
                                <label
                                  key={dept.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 10px', borderRadius: '20px', cursor: visibilityBusy ? 'not-allowed' : 'pointer',
                                    border: `1px solid ${allowed ? 'var(--accent)' : 'var(--border)'}`,
                                    backgroundColor: allowed ? 'var(--accent-light)' : 'white',
                                    fontSize: '12px', fontWeight: 500,
                                    color: allowed ? 'var(--accent)' : 'var(--text-secondary)',
                                    opacity: visibilityBusy ? 0.6 : 1,
                                    userSelect: 'none',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={allowed}
                                    disabled={visibilityBusy}
                                    onChange={() => handleToggleDeptVisibility(source.id, dept.id, allowed)}
                                    style={{ display: 'none' }}
                                  />
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dept.color ? `#${dept.color.replace('#','')}` : 'var(--accent)', flexShrink: 0 }} />
                                  {dept.name}
                                </label>
                              )
                            })}
                          </div>
                          {!isOrgWide && (
                            <button
                              onClick={() => handleMakeOrgWide(source.id)}
                              disabled={visibilityBusy}
                              style={{
                                fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                textDecoration: 'underline',
                              }}
                            >
                              Reset to visible to everyone
                            </button>
                          )}
                        </div>
                      )}

                      {/* Category panel (expands independently of visibility panel) */}
                      {expandedCategory === source.id && (
                        <div style={{
                          padding: '10px 14px 12px',
                          borderTop: '1px solid var(--border-light)',
                          backgroundColor: 'white',
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                            Event category
                          </div>
                          {pendingCategory[source.id] !== undefined && (
                            <div style={{ fontSize: '12px', color: '#92400E', backgroundColor: '#FFFBEB', padding: '6px 10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #F59E0B' }}>
                              Auto-suggested based on calendar name — save to confirm.
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {/* Color swatch for currently selected type */}
                            {(() => {
                              const typeName = pendingCategory[source.id] !== undefined ? pendingCategory[source.id] : (source.default_event_type || 'event')
                              const et = eventTypes.find((t) => t.name === typeName)
                              return et ? <span style={{ width: 12, height: 12, borderRadius: '50%', background: et.color || '#3B82F6', flexShrink: 0 }} /> : null
                            })()}
                            <select
                              value={pendingCategory[source.id] !== undefined ? pendingCategory[source.id] : (source.default_event_type || 'event')}
                              onChange={(e) => {
                                if (pendingCategory[source.id] !== undefined) {
                                  // Auto-suggest is pending — update it but wait for Save
                                  setPendingCategory((prev) => ({ ...prev, [source.id]: e.target.value }))
                                } else {
                                  // Manual change — save immediately
                                  handleSaveCategory(source.id, e.target.value)
                                }
                              }}
                              disabled={categoryBusy}
                              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-primary)', backgroundColor: 'white' }}
                            >
                              {eventTypes.map((et) => (
                                <option key={et.name} value={et.name}>{et.name}</option>
                              ))}
                            </select>
                            {pendingCategory[source.id] !== undefined && (
                              <button
                                onClick={() => handleSaveCategory(source.id, pendingCategory[source.id])}
                                disabled={categoryBusy}
                                style={{
                                  padding: '5px 12px', borderRadius: '6px', border: 'none',
                                  backgroundColor: 'var(--accent)', color: 'white',
                                  fontSize: '12px', fontWeight: 600, cursor: categoryBusy ? 'not-allowed' : 'pointer',
                                  opacity: categoryBusy ? 0.6 : 1,
                                }}
                              >
                                {categoryBusy ? 'Saving…' : 'Save'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
