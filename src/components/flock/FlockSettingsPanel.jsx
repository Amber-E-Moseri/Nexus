import { useEffect, useState } from 'react'
import { Check, Settings as SettingsIcon, User, X } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, FLOCK } from '../../lib/flockSupabase'

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

function SettingRow({ setting, onSave }) {
  const [val, setVal] = useState(setting.val || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // 'ok' | 'err'

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
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontBody }}>{setting.label}</div>
        {setting.desc && <div style={{ fontSize: '12px', color: FLOCK.muted, marginTop: '2px' }}>{setting.desc}</div>}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input type="text" value={val} onChange={(e) => setVal(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            padding: '9px 16px',
            background: FLOCK.purple,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
            fontFamily: FLOCK.fontBody,
          }}
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
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await callFlockAPI('getSettings')
      setSettings(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e.message || 'Could not load settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onSave = (key, val) => {
    setSettings((cur) => cur.map((s) => (s.key === key ? { ...s, val } : s)))
  }

  const yourName = settings.find((s) => s.key === 'YOUR_NAME')
  const appSettings = settings.filter((s) => s.key !== 'YOUR_NAME')

  return (
    <div style={{ display: 'grid', gap: '16px', maxWidth: '620px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <SettingsIcon size={20} color={FLOCK.purple} />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Settings</h2>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted }}>Reminders, schedule hours, timezone, and your name.</p>
      </div>

      {error && <div style={{ fontSize: '13px', color: FLOCK.red }}>{error}</div>}

      {loading ? (
        <div style={{ ...flockCard({ padding: '28px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px' }}>Loading settings…</div>
      ) : (
        <>
          {yourName && (
            <div style={flockCard({ padding: '16px', background: FLOCK.purpleTint, borderColor: 'transparent', display: 'grid', gap: '8px' })}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={15} color={FLOCK.purple} />
                <div style={{ fontSize: '11px', fontWeight: 700, color: FLOCK.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Your Name
                </div>
              </div>
              <div style={{ fontSize: '12px', color: FLOCK.muted }}>Used in greetings and email reminders.</div>
              <SettingRowInline setting={yourName} onSave={onSave} />
            </div>
          )}

          <div style={{ display: 'grid', gap: '10px' }}>
            {appSettings.map((s) => (
              <SettingRow key={s.key} setting={s} onSave={onSave} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Bare input+save row, used inline inside the Your Name card (no nested card chrome). */
function SettingRowInline({ setting, onSave }) {
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
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <input type="text" value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. Pastor John" style={{ ...inputStyle, flex: 1, background: FLOCK.card }} />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{
          padding: '9px 16px',
          background: FLOCK.purple,
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.7 : 1,
          fontFamily: FLOCK.fontBody,
        }}
      >
        {saving ? '…' : 'Save'}
      </button>
      {status === 'ok' && <Check size={16} color={FLOCK.green} />}
      {status === 'err' && <X size={16} color={FLOCK.red} />}
    </div>
  )
}
