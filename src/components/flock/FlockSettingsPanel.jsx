import { useEffect, useState } from 'react'
import { Bell, Check, Clock, Settings as SettingsIcon, User, X } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, FLOCK } from '../../lib/flockSupabase'
import { useAuth } from '../../hooks/useAuth'

const inputStyle = {
  padding: '10px 12px',
  border: `1px solid ${FLOCK.border}`,
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: FLOCK.fontBody,
  color: FLOCK.text,
  outline: 'none',
  boxSizing: 'border-box',
}

// Flock-specific settings — keys must match SETTINGS_ORDER in flockSupabase.js
const FLOCK_SETTING_KEYS = ['YOUR_NAME', 'REMINDER_EMAIL', 'MORNING_REMINDER_HOUR', 'DUESTATUS_REFRESH_HOUR', 'MONDAY_FOLLOWUPS_HOUR', 'TIMEZONE']

const SETTING_META = {
  YOUR_NAME:              { label: 'Your Name',              desc: 'Used in greetings and email reminders.',               icon: User },
  REMINDER_EMAIL:         { label: 'Reminder Email',         desc: 'Email address to receive follow-up reminders.',         icon: Bell },
  MORNING_REMINDER_HOUR:  { label: 'Morning Reminder Hour',  desc: 'Hour (0–23) to send your daily follow-up reminders.',   icon: Clock },
  DUESTATUS_REFRESH_HOUR: { label: 'Due Status Refresh Hour',desc: 'Hour (0–23) to recompute who is coming due.',           icon: Clock },
  MONDAY_FOLLOWUPS_HOUR:  { label: 'Monday Digest Hour',     desc: 'Hour (0–23) for your Monday weekly follow-up digest.',  icon: Clock },
  TIMEZONE:               { label: 'Timezone',               desc: 'IANA timezone for scheduling (e.g. America/Toronto).',  icon: Clock },
}

function SettingRow({ setting, onSave }) {
  const meta = SETTING_META[setting.key] || {}
  const Icon = meta.icon || SettingsIcon
  const [val, setVal] = useState(setting.val || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  const save = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const res = await callFlockAPI('saveSetting', { key: setting.key, val })
      if (res && res.success) {
        onSave?.(setting.key, val)
        setStatus('ok')
        setTimeout(() => setStatus((cur) => (cur === 'ok' ? null : cur)), 2000)
      } else {
        setStatus('err')
      }
    } catch {
      setStatus('err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={flockCard({ padding: '14px 16px', display: 'grid', gap: '8px' })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon size={14} color={FLOCK.purple} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontBody }}>{meta.label || setting.label || setting.key}</div>
          {(meta.desc || setting.desc) && <div style={{ fontSize: '12px', color: FLOCK.muted, marginTop: '2px' }}>{meta.desc || setting.desc}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input type="text" value={val} onChange={(e) => setVal(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ padding: '9px 16px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: FLOCK.fontBody }}
        >
          {saving ? '…' : 'Save'}
        </button>
        {status === 'ok' && <Check size={16} color={FLOCK.green} />}
        {status === 'err' && <X size={16} color={FLOCK.red} />}
      </div>
    </div>
  )
}

export default function FlockSettingsPanel() {
  const { profile, user } = useAuth()
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Depend on user.id (not just []) — otherwise switching accounts in the same
  // tab without a hard refresh left the previous pastor's settings on screen.
  useEffect(() => {
    setSettings([])
    setLoading(true)
    setError(null)
    callFlockAPI('getSettings')
      .then((list) => setSettings(Array.isArray(list) ? list.filter((s) => FLOCK_SETTING_KEYS.includes(s.key)) : []))
      .catch((e) => setError(e.message || 'Could not load settings.'))
      .finally(() => setLoading(false))
  }, [user?.id])

  const onSave = (key, val) => setSettings((cur) => cur.map((s) => (s.key === key ? { ...s, val } : s)))

  return (
    <div style={{ display: 'grid', gap: '20px', maxWidth: '620px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <SettingsIcon size={20} color={FLOCK.purple} />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Flock Preferences</h2>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted }}>Call scheduling and reminder settings. Your profile info is managed in Nexus Settings.</p>
      </div>

      {/* Read-only identity card pulled from Nexus profile */}
      <div style={flockCard({ padding: '16px', background: FLOCK.purpleTint, borderColor: 'transparent' })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: FLOCK.purple, color: '#FFFFFF', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <User size={16} />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontBody }}>{profile?.name || profile?.first_name || 'Your Name'}</div>
            <div style={{ fontSize: '12px', color: FLOCK.muted, marginTop: '2px' }}>{profile?.email || ''}</div>
            <div style={{ fontSize: '11px', color: FLOCK.purple, fontWeight: 600, marginTop: '3px', textTransform: 'capitalize' }}>{profile?.role?.replace(/_/g, ' ') || 'Pastor'}</div>
          </div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', color: FLOCK.muted, borderTop: `1px solid ${FLOCK.border}`, paddingTop: '10px' }}>
          Name, email, and role are synced from your Nexus account. Update them in{' '}
          <a href="/settings" style={{ color: FLOCK.purple, fontWeight: 600, textDecoration: 'none' }}>Settings → Profile</a>.
        </div>
      </div>

      {error && <div style={{ fontSize: '13px', color: FLOCK.red }}>{error}</div>}

      {loading ? (
        <div style={{ ...flockCard({ padding: '28px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px' }}>Loading preferences…</div>
      ) : settings.length > 0 ? (
        <div style={{ display: 'grid', gap: '10px' }}>
          {settings.map((s) => (
            <SettingRow key={s.key} setting={s} onSave={onSave} />
          ))}
        </div>
      ) : (
        <div style={{ ...flockCard({ padding: '24px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px' }}>
          No additional preferences configured for this account.
        </div>
      )}
    </div>
  )
}
