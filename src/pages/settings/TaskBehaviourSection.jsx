import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const DEFAULTS = {
  remap_subtask_dates: true,
  include_closed_in_remap: false,
  reschedule_dependencies: true,
  include_closed_in_reschedule: false,
}

const TOGGLES = [
  {
    key: 'remap_subtask_dates',
    label: 'Remap subtask due dates',
    info: 'When you change a parent task\'s due date, subtask due dates shift by the same number of days to keep relative gaps intact.',
  },
  {
    key: 'include_closed_in_remap',
    label: 'Include completed / cancelled subtasks in remap',
    dependsOn: 'remap_subtask_dates',
    info: 'By default only open and in-progress subtasks are shifted. Enable this to also move already-closed subtasks.',
  },
  {
    key: 'reschedule_dependencies',
    label: 'Reschedule dependent tasks',
    info: 'When a task\'s due date moves, any tasks that are blocked by it will have their due dates adjusted forward proportionally.',
  },
  {
    key: 'include_closed_in_reschedule',
    label: 'Include completed / cancelled dependents in reschedule',
    dependsOn: 'reschedule_dependencies',
    info: 'By default only open dependents are rescheduled. Enable this to also move already-closed dependent tasks.',
  },
]

function Toggle({ id, checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        flexShrink: 0,
        width: 40,
        height: 22,
        borderRadius: 11,
        border: 'none',
        background: disabled ? '#E2DDD6' : checked ? 'var(--accent)' : '#D1CBC0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background 0.18s',
        padding: 0,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          display: 'block',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'white',
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          transition: 'left 0.18s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
        }}
      />
    </button>
  )
}

function ToggleRow({ toggle, value, disabled, onToggle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <label
          htmlFor={`toggle-${toggle.key}`}
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
            cursor: disabled ? 'default' : 'pointer',
            lineHeight: 1.4,
          }}
        >
          {toggle.label}
        </label>
        <Toggle
          id={`toggle-${toggle.key}`}
          checked={value}
          disabled={disabled}
          onChange={onToggle}
        />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
        {toggle.info}
      </p>
    </div>
  )
}

export default function TaskBehaviourSection({ userId }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!userId) return
    supabase
      .from('user_task_settings')
      .select('remap_subtask_dates,include_closed_in_remap,reschedule_dependencies,include_closed_in_reschedule')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings({ ...DEFAULTS, ...data })
      })
  }, [userId])

  async function handleToggle(key) {
    if (!userId) return

    const dependant = TOGGLES.find((t) => t.dependsOn === key)
    const next = { ...settings, [key]: !settings[key] }
    if (dependant && !next[key]) next[dependant.key] = false

    setSettings(next)
    setMessage('')
    setSaving(true)

    const { error } = await supabase
      .from('user_task_settings')
      .upsert({ user_id: userId, ...next }, { onConflict: 'user_id' })

    setSaving(false)
    if (error) {
      setSettings(settings)
      setMessage(error.message)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Task Behaviour
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 0 }}>
          Control how date changes cascade to subtasks and dependent tasks.
          These settings apply only to your account.
        </p>
      </div>

      <div
        style={{
          background: 'white',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {TOGGLES.map((toggle) => {
          const parentDisabled = toggle.dependsOn ? !settings[toggle.dependsOn] : false
          return (
            <div key={toggle.key}>
              <ToggleRow
                toggle={toggle}
                value={settings[toggle.key]}
                disabled={parentDisabled}
                onToggle={() => handleToggle(toggle.key)}
              />
              {toggle.dependsOn && (
                <div
                  style={{
                    borderTop: '1px solid var(--border)',
                    marginTop: 20,
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {message ? (
        <p style={{ fontSize: 12, color: 'var(--coral-dark)', margin: 0 }}>{message}</p>
      ) : saving ? (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Saving…</p>
      ) : null}
    </section>
  )
}
