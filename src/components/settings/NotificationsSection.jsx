import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { NOTIFICATION_TYPES, setNotificationPref } from '../../features/notifications'
import { supabase } from '../../lib/supabase'
import { requestPushPermission, unsubscribePush, isPushEnabled, getPushStatus } from '../../lib/webPush'
import { Bell, Mail, Smartphone, AlertCircle, Check } from 'lucide-react'

const NOTIFICATION_CHANNELS = [
  { id: 'in_app', label: 'In-App', icon: Bell, alwaysOn: true, description: 'Bell icon notifications' },
  { id: 'email', label: 'Email', icon: Mail, description: 'Email notifications' },
  { id: 'mobile', label: 'Mobile Push', icon: Smartphone, description: 'Push notifications on your phone' }
]

export default function NotificationsSection({ prefs = {}, role, onTogglePref }) {
  const { user } = useAuth()
  const [preferences, setPreferences] = useState(prefs)
  const [browserSupport, setBrowserSupport] = useState(false)
  const [browserPermission, setBrowserPermission] = useState('default')
  const [mobileToken, setMobileToken] = useState(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushStatus, setPushStatus] = useState({ supported: false, permission: 'denied', subscribed: false })
  const [saving, setSaving] = useState({})
  const [message, setMessage] = useState('')

  useEffect(() => {
    if ('Notification' in window) {
      setBrowserSupport(true)
      setBrowserPermission(Notification.permission)
    }
    checkPushStatus()
  }, [])

  const checkPushStatus = async () => {
    const status = await getPushStatus()
    setPushStatus(status)
    setPushEnabled(status.subscribed)
  }

  const handleTogglePush = async () => {
    setPushLoading(true)
    setMessage('')

    try {
      if (pushEnabled) {
        const success = await unsubscribePush()
        if (success) {
          setPushEnabled(false)
          setMessage('Mobile push notifications disabled')
        } else {
          setMessage('Failed to disable push notifications')
        }
      } else {
        const success = await requestPushPermission()
        if (success) {
          setPushEnabled(true)
          setMessage('✅ Mobile push notifications enabled!')
          await checkPushStatus()
        } else {
          setMessage('Failed to enable push notifications. Please check browser permissions.')
        }
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setPushLoading(false)
    }
  }

  const handleChannelToggle = async (type, channel) => {
    setSaving((prev) => ({ ...prev, [`${type}-${channel}`]: true }))
    setMessage('')

    try {
      const current = preferences[type] || {}
      const next = { ...current, [channel]: !current[channel] }

      setPreferences((prev) => ({
        ...prev,
        [type]: next
      }))

      // Save to database
      const { error } = await supabase
        .from('user_notification_prefs')
        .upsert(
          {
            user_id: user.id,
            notification_type: type,
            [channel]: !current[channel]
          },
          { onConflict: 'user_id,notification_type' }
        )

      if (error) throw error
    } catch (err) {
      setMessage(`Failed to save preference: ${err.message}`)
      // Revert
      setPreferences(prefs)
    } finally {
      setSaving((prev) => ({ ...prev, [`${type}-${channel}`]: false }))
    }
  }

  const requestBrowserPermission = async () => {
    if (!browserSupport) return

    try {
      const permission = await Notification.requestPermission()
      setBrowserPermission(permission)

      if (permission === 'granted') {
        setMessage('Browser notifications enabled!')
        localStorage.setItem('notification-permission-asked', 'true')
      }
    } catch (err) {
      setMessage(`Failed to request permission: ${err.message}`)
    }
  }

  const notificationTypesList = Object.entries(NOTIFICATION_TYPES).map(([key, value]) => ({
    key,
    ...value
  }))

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex gap-3">
          <AlertCircle size={18} style={{ color: '#059669', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: '#059669', margin: 0 }}>{message}</p>
        </div>
      )}

      {/* Browser Notification Status */}
      {browserSupport && (
        <div className="rounded-xl border border-[var(--border)] bg-white p-5 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                Browser Notifications
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                {browserPermission === 'granted'
                  ? '✅ Enabled - You will receive desktop alerts'
                  : browserPermission === 'denied'
                    ? '❌ Blocked - Check your browser settings to re-enable'
                    : '⏳ Not requested yet'}
              </p>
              {browserPermission !== 'granted' && browserPermission !== 'denied' && (
                <button
                  onClick={requestBrowserPermission}
                  className="text-xs font-medium text-white bg-[var(--accent)] px-3 py-1.5 rounded-md hover:opacity-90 transition"
                >
                  Enable Browser Notifications
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Push Notification Status */}
      {pushStatus.supported && (
        <div className="rounded-xl border border-[var(--border)] bg-white p-5 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Smartphone size={18} style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Mobile Push Notifications
                </h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                {pushEnabled
                  ? '✅ Enabled - You will receive notifications on this device'
                  : '⭕ Disabled - Enable to get task notifications on your phone'}
              </p>
              <p style={{ fontSize: '11px', color: '#9e9488', margin: '8px 0 0 0' }}>
                Works on Android Chrome, Firefox, Edge and iOS Safari
              </p>
            </div>
            <button
              onClick={handleTogglePush}
              disabled={pushLoading}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                pushEnabled
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-[var(--accent)] text-white hover:opacity-90'
              } disabled:opacity-50`}
            >
              {pushLoading ? 'Updating...' : pushEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      )}

      {/* Notification Types Matrix */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="bg-[var(--surface-secondary)] px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Notification Preferences
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Choose which notification types and channels you want to receive
          </p>
        </div>

        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--surface-secondary)'
                }}>
                  Notification Type
                </th>
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <th
                    key={channel.id}
                    style={{
                      textAlign: 'center',
                      padding: '12px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--surface-secondary)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notificationTypesList.map((notificationType) => (
                <tr
                  key={notificationType.key}
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <td style={{
                    padding: '12px 16px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    fontWeight: 500
                  }}>
                    <div>{notificationType.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {notificationType.description}
                    </div>
                  </td>
                  {NOTIFICATION_CHANNELS.map((channel) => (
                    <td
                      key={`${notificationType.key}-${channel.id}`}
                      style={{
                        textAlign: 'center',
                        padding: '12px 8px'
                      }}
                    >
                      {channel.alwaysOn ? (
                        <div style={{
                          fontSize: '20px',
                          opacity: 0.5
                        }}>
                          ✓
                        </div>
                      ) : (
                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={preferences[notificationType.key]?.[channel.id] ?? false}
                            onChange={() => handleChannelToggle(notificationType.key, channel.id)}
                            disabled={saving[`${notificationType.key}-${channel.id}`]}
                            style={{
                              width: '16px',
                              height: '16px',
                              cursor: 'pointer',
                              accentColor: 'var(--accent)'
                            }}
                          />
                        </label>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{
          padding: '12px 16px',
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          backgroundColor: 'var(--surface-secondary)',
          borderTop: '1px solid var(--border)'
        }}>
          ✓ = Always enabled | Unchecked = Disabled
        </div>
      </div>

      {/* Privacy Note */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#F5F3F0',
        borderRadius: '8px',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        border: '1px solid #E8DEDD'
      }}>
        <strong>Privacy:</strong> We never share your email or notification preferences with third parties. Browser and mobile notifications are stored locally and on your device only.
      </div>
    </div>
  )
}
