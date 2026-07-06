// Calendar Sources Panel
// Lets any user hide/show individual Ministry Calendar sources (org calendar,
// Birthdays, Holidays, etc) from their own view. Missing preference row =
// visible (fail open); hiding a source persists a row, showing it again
// deletes it — same convention as CategoryVisibilityConfig.

import { CalendarDays } from 'lucide-react'
import { useCalendarSourcePreferences } from '../hooks/useCalendarSourcePreferences'
import Toggle from './Toggle'

export default function CalendarSourcesPanel() {
  const { sources, hiddenSourceIds, loading, error, toggleVisibility } = useCalendarSourcePreferences()

  // No card at all before an admin has connected anything to show.
  if (!loading && sources.length === 0) return null

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'white',
        overflow: 'hidden',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-tertiary)',
        }}
      >
        <CalendarDays size={16} style={{ color: 'var(--accent)' }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Calendar Sources
        </h3>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: '#FEF0ED', color: '#C94830', fontSize: 12, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12.5 }}>
          Loading…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sources.map((source) => {
            const hidden = hiddenSourceIds.has(source.id)
            return (
              <div
                key={source.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: source.color || 'var(--accent)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>
                  {source.display_name}
                </span>
                <Toggle
                  checked={!hidden}
                  onChange={() => toggleVisibility(source.id, hidden)}
                  label={`Show ${source.display_name} on my calendar`}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
