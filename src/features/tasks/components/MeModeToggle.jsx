import { useRef, useState, useEffect } from 'react'
import { useAuth } from '../../../hooks/useAuth'

export default function MeModeToggle({ active, options = {}, onChange }) {
  const { profile } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const ref = useRef(null)

  const initials = (profile?.full_name ?? profile?.name ?? 'Me')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  useEffect(() => {
    if (!dropdownOpen) return
    function handler(e) {
      if (!ref.current?.contains(e.target)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const toggle = (key) => onChange({ ...options, [key]: !options[key] })

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => onChange({ comments: false, subtasks: false, checklists: false }, true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: '#FFFFFF',
          color: 'var(--text-primary)',
          fontSize: 12.5,
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: 'var(--accent)', color: '#FFF',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {initials}
        </div>
        Me mode
      </button>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setDropdownOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 999,
          border: '1.5px solid #E91E8C',
          background: '#FFF0F8',
          color: '#C01070',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: '#E91E8C', color: '#FFF',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {initials}
        </div>
        Me mode
        <span
          title="Clear Me mode"
          onClick={(e) => { e.stopPropagation(); onChange(null, false) }}
          style={{ marginLeft: 2, fontSize: 14, lineHeight: 1, color: '#C01070', cursor: 'pointer' }}
        >×</span>
      </button>

      {dropdownOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          background: '#FFFFFF',
          border: '1px solid #E8E0D2',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(28,22,16,0.12)',
          padding: '10px 0',
          minWidth: 220,
          zIndex: 200,
        }}>
          <div style={{ padding: '4px 14px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Tasks where I have assigned
          </div>
          {[
            { key: 'comments', label: 'Comments' },
            { key: 'subtasks', label: 'Subtasks' },
            { key: 'checklists', label: 'Checklists' },
          ].map(({ key, label }) => (
            <div
              key={key}
              onClick={() => toggle(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 14px',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-primary)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F3' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {label}
              <Toggle on={!!options[key]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Toggle({ on }) {
  return (
    <div style={{
      width: 36, height: 20, borderRadius: 999,
      background: on ? '#E91E8C' : '#D5CCBE',
      position: 'relative',
      transition: 'background 0.2s',
      flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute',
        top: 2, left: on ? 18 : 2,
        width: 16, height: 16,
        borderRadius: '50%',
        background: '#FFF',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}
