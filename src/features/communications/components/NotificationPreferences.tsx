import { useState, useEffect } from 'react'
import { useAuth } from '../../../lib/auth'
import { createClient } from '@supabase/supabase-js'

interface NotificationPrefs {
  broadcasts_via_app: boolean
  broadcasts_via_email: boolean
  system_alerts_via_app: boolean
  system_alerts_via_email: boolean
  direct_messages_via_app: boolean
  direct_messages_via_email: boolean
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  quiet_hours_tz: string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const DEFAULT_PREFS: NotificationPrefs = {
  broadcasts_via_app: true,
  broadcasts_via_email: true,
  system_alerts_via_app: true,
  system_alerts_via_email: false,
  direct_messages_via_app: true,
  direct_messages_via_email: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  quiet_hours_tz: 'America/Toronto',
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Australia/Sydney',
]

export function NotificationPreferences() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Fetch preferences on mount
  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    const fetchPrefs = async () => {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: {
            headers: {
              Authorization: `Bearer ${user.session?.access_token || ''}`,
            },
          },
        })

        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (!error && data) {
          setPrefs({
            broadcasts_via_app: data.broadcasts_via_app,
            broadcasts_via_email: data.broadcasts_via_email,
            system_alerts_via_app: data.system_alerts_via_app,
            system_alerts_via_email: data.system_alerts_via_email,
            direct_messages_via_app: data.direct_messages_via_app,
            direct_messages_via_email: data.direct_messages_via_email,
            quiet_hours_enabled: data.quiet_hours_enabled,
            quiet_hours_start: data.quiet_hours_start?.substring(0, 5) || '22:00',
            quiet_hours_end: data.quiet_hours_end?.substring(0, 5) || '08:00',
            quiet_hours_tz: data.quiet_hours_tz || 'America/Toronto',
          })
        }
      } catch (error) {
        console.error('Error fetching preferences:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPrefs()
  }, [user?.id, user?.session?.access_token])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return

    setSaving(true)
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: `Bearer ${user.session?.access_token || ''}`,
          },
        },
      })

      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            broadcasts_via_app: prefs.broadcasts_via_app,
            broadcasts_via_email: prefs.broadcasts_via_email,
            system_alerts_via_app: prefs.system_alerts_via_app,
            system_alerts_via_email: prefs.system_alerts_via_email,
            direct_messages_via_app: prefs.direct_messages_via_app,
            direct_messages_via_email: prefs.direct_messages_via_email,
            quiet_hours_enabled: prefs.quiet_hours_enabled,
            quiet_hours_start: prefs.quiet_hours_start,
            quiet_hours_end: prefs.quiet_hours_end,
            quiet_hours_tz: prefs.quiet_hours_tz,
          },
          { onConflict: 'user_id' }
        )

      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else {
        setMessage({ type: 'success', text: 'Preferences saved successfully!' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save preferences',
      })
    } finally {
      setSaving(false)
    }
  }

  // Handle checkbox change
  const handleCheckboxChange = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Handle time input change
  const handleTimeChange = (field: 'quiet_hours_start' | 'quiet_hours_end', value: string) => {
    setPrefs((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin inline-block">
          <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Notification Preferences</h2>

      {message && (
        <div
          className={`p-3 rounded-lg mb-6 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Broadcasts section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Broadcasts</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.broadcasts_via_app}
                onChange={() => handleCheckboxChange('broadcasts_via_app')}
                className="w-4 h-4 border-gray-300 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Show in app inbox</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.broadcasts_via_email}
                onChange={() => handleCheckboxChange('broadcasts_via_email')}
                className="w-4 h-4 border-gray-300 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Send email</span>
            </label>
          </div>
        </div>

        {/* System Alerts section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">System Alerts</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.system_alerts_via_app}
                onChange={() => handleCheckboxChange('system_alerts_via_app')}
                className="w-4 h-4 border-gray-300 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Show in app inbox</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.system_alerts_via_email}
                onChange={() => handleCheckboxChange('system_alerts_via_email')}
                className="w-4 h-4 border-gray-300 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Send email</span>
            </label>
          </div>
        </div>

        {/* Direct Messages section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Direct Messages</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.direct_messages_via_app}
                onChange={() => handleCheckboxChange('direct_messages_via_app')}
                className="w-4 h-4 border-gray-300 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Show in app inbox</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.direct_messages_via_email}
                onChange={() => handleCheckboxChange('direct_messages_via_email')}
                className="w-4 h-4 border-gray-300 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Send email</span>
            </label>
          </div>
        </div>

        {/* Quiet Hours section */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={prefs.quiet_hours_enabled}
              onChange={() => handleCheckboxChange('quiet_hours_enabled')}
              className="w-4 h-4 border-gray-300 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm font-semibold text-gray-900">Enable quiet hours</span>
          </label>

          {prefs.quiet_hours_enabled && (
            <div className="ml-6 space-y-3 p-3 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Start time
                </label>
                <input
                  type="time"
                  value={prefs.quiet_hours_start}
                  onChange={(e) => handleTimeChange('quiet_hours_start', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  End time
                </label>
                <input
                  type="time"
                  value={prefs.quiet_hours_end}
                  onChange={(e) => handleTimeChange('quiet_hours_end', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Timezone
                </label>
                <select
                  value={prefs.quiet_hours_tz}
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      quiet_hours_tz: e.target.value,
                    }))
                  }
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          type="submit"
          disabled={saving}
          className={`
            w-full px-4 py-2 rounded-lg font-medium transition-colors
            ${saving
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
            }
          `}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </form>
    </div>
  )
}
