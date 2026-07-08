import { List, LayoutGrid } from 'lucide-react'

export default function ViewToggle({ view, onViewChange }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        background: 'var(--surface-sub)',
        borderRadius: 6,
        width: 'fit-content',
      }}
      role="group"
      aria-label="Toggle view layout"
    >
      <button
        type="button"
        onClick={() => onViewChange('list')}
        aria-pressed={view === 'list'}
        aria-label="List view"
        title="List view"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 4,
          border: 'none',
          background: view === 'list' ? 'white' : 'transparent',
          color: view === 'list' ? 'var(--purple-700)' : 'var(--ink-3)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (view !== 'list') e.currentTarget.style.background = 'var(--purple-tint)'
        }}
        onMouseLeave={(e) => {
          if (view !== 'list') e.currentTarget.style.background = 'transparent'
        }}
      >
        <List size={18} />
      </button>
      <button
        type="button"
        onClick={() => onViewChange('grid')}
        aria-pressed={view === 'grid'}
        aria-label="Card gallery view"
        title="Card gallery view"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 4,
          border: 'none',
          background: view === 'grid' ? 'white' : 'transparent',
          color: view === 'grid' ? 'var(--purple-700)' : 'var(--ink-3)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (view !== 'grid') e.currentTarget.style.background = 'var(--purple-tint)'
        }}
        onMouseLeave={(e) => {
          if (view !== 'grid') e.currentTarget.style.background = 'transparent'
        }}
      >
        <LayoutGrid size={18} />
      </button>
    </div>
  )
}
