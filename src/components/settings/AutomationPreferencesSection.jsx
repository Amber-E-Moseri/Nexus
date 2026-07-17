import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { ACTION_LABELS, TRIGGER_LABELS } from '../../features/automations/lib/automations'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

const EMAIL_ACTION_TYPES = new Set(['send_email'])

function hasEmailAction(actions) {
  return Array.isArray(actions) && actions.some((a) => EMAIL_ACTION_TYPES.has(a.type))
}

export default function AutomationPreferencesSection() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [automations, setAutomations] = useState([])
  const [prefs, setPrefs] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    loadData()
  }, [profile?.id])

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: autos }, { data: userPrefs }] = await Promise.all([
        supabase
          .from('automations')
          .select('id, name, description, trigger_type, actions, department_id, enabled')
          .eq('enabled', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_automation_preferences')
          .select('automation_id, enabled, email_opted_in, max_emails_per_day')
          .eq('user_id', profile.id),
      ])

      setAutomations(autos ?? [])

      // Build pref map keyed by automation_id
      const prefMap = {}
      for (const p of userPrefs ?? []) {
        prefMap[p.automation_id] = p
      }
      setPrefs(prefMap)
    } catch (err) {
      console.error('Failed to load automation preferences:', err)
    } finally {
      setLoading(false)
    }
  }

  async function upsertPref(automationId, updates) {
    setSaving(automationId)
    try {
      const current = prefs[automationId] ?? {}
      const next = { ...current, ...updates }

      const { error } = await supabase
        .from('user_automation_preferences')
        .upsert(
          {
            user_id: profile.id,
            automation_id: automationId,
            enabled: next.enabled ?? true,
            email_opted_in: next.email_opted_in ?? false,
            max_emails_per_day: next.max_emails_per_day ?? 3,
          },
          { onConflict: 'user_id,automation_id' }
        )

      if (error) throw error

      setPrefs((prev) => ({ ...prev, [automationId]: { ...prev[automationId], ...updates } }))
    } catch (err) {
      showToast('Failed to save preference', 'error')
    } finally {
      setSaving(null)
    }
  }

  function getPref(automationId) {
    return prefs[automationId] ?? { enabled: true, email_opted_in: false, max_emails_per_day: 3 }
  }

  if (loading) {
    return <div style={{ padding: 32, color: 'var(--ink-2)', fontFamily: FONT_BODY }}>Loading automations…</div>
  }

  if (!automations.length) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-2)', fontFamily: FONT_BODY }}>
        No active automations to configure.
      </div>
    )
  }

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      <p style={{ marginBottom: 20, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        All org-wide automations are active by default. You can turn off any automation for yourself here,
        or opt in to receive automated emails (off by default).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {automations.map((auto) => {
          const pref = getPref(auto.id)
          const isEmail = hasEmailAction(auto.actions)
          const isSaving = saving === auto.id

          return (
            <div
              key={auto.id}
              style={{
                background: 'white',
                border: '1px solid var(--border-1)',
                borderRadius: 12,
                padding: '14px 18px',
                opacity: isSaving ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-1)' }}>{auto.name}</div>
                  {auto.description && (
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{auto.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, background: 'var(--purple-tint)', color: 'var(--purple-700)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                      {TRIGGER_LABELS[auto.trigger_type] ?? auto.trigger_type}
                    </span>
                    {isEmail && (
                      <span style={{ fontSize: 11, background: 'var(--accent-yellow-tint)', color: 'var(--accent-yellow-text)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                        Sends email
                      </span>
                    )}
                  </div>
                </div>

                {/* Main enabled toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={pref.enabled}
                  onClick={() => upsertPref(auto.id, { enabled: !pref.enabled })}
                  disabled={isSaving}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: pref.enabled ? '#2E8B57' : '#D7D0C6',
                    position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2,
                    left: pref.enabled ? 20 : 2,
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>

              {/* Email opt-in row — only shown if this automation sends emails */}
              {isEmail && pref.enabled && (
                <div
                  style={{
                    marginTop: 12, paddingTop: 12,
                    borderTop: '1px solid var(--border-1)',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pref.email_opted_in}
                      onClick={() => upsertPref(auto.id, { email_opted_in: !pref.email_opted_in })}
                      disabled={isSaving}
                      style={{
                        width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer',
                        background: pref.email_opted_in ? '#4C2A92' : '#D7D0C6',
                        position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 1,
                        left: pref.email_opted_in ? 16 : 1,
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                    <span style={{ color: 'var(--ink-1)', fontWeight: 500 }}>Receive emails from this automation</span>
                  </label>

                  {pref.email_opted_in && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-2)', marginLeft: 'auto' }}>
                      Max per day:
                      <select
                        value={pref.max_emails_per_day ?? 3}
                        onChange={(e) => upsertPref(auto.id, { max_emails_per_day: Number(e.target.value) })}
                        disabled={isSaving}
                        style={{
                          border: '1px solid var(--border-1)', borderRadius: 6,
                          padding: '3px 8px', fontSize: 13, background: 'white',
                          color: 'var(--ink-1)', cursor: 'pointer',
                        }}
                      >
                        <option value={1}>1 email</option>
                        <option value={3}>3 emails</option>
                        <option value={5}>5 emails</option>
                        <option value={10}>10 emails</option>
                        <option value={0}>Unlimited</option>
                      </select>
                    </label>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
