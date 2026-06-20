export default function DepartmentFilter({ departments, selected, onChange, count }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto', paddingBottom: 4 }}>
      <button
        type="button"
        onClick={() => onChange('all')}
        style={{
          flexShrink: 0,
          borderRadius: 999,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          border: selected === 'all' ? 'none' : '1px solid var(--border)',
          background: selected === 'all' ? '#4C2A92' : 'white',
          color: selected === 'all' ? 'white' : 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'all 0.12s',
        }}
      >
        All
      </button>
      {departments.map((dept) => (
        <button
          key={dept.id}
          type="button"
          onClick={() => onChange(dept.id)}
          style={{
            flexShrink: 0,
            borderRadius: 999,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            border: selected === dept.id ? 'none' : '1px solid var(--border)',
            background: selected === dept.id ? '#4C2A92' : 'white',
            color: selected === dept.id ? 'white' : 'var(--text-primary)',
            cursor: 'pointer',
            transition: 'all 0.12s',
          }}
        >
          {dept.name}
        </button>
      ))}
      {count !== undefined && (
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
          {count} {count === 1 ? 'meeting' : 'meetings'}
        </span>
      )}
    </div>
  )
}
