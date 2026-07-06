// Small pill switch shared by CategoryVisibilityConfig, CalendarSourcesPanel,
// and CalendarSourcesAdminPanel — extracted since it's now used in 3 places.

export default function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        background: disabled ? '#E2DDD6' : checked ? 'var(--accent)' : '#D1CBC0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background 0.18s',
        padding: 0,
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'white',
          position: 'absolute',
          top: 3,
          left: checked ? 19 : 3,
          transition: 'left 0.18s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
        }}
      />
    </button>
  )
}
