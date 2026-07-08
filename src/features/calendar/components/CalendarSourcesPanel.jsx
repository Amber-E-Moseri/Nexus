// Calendar Sources Panel
// Lets any user hide/show individual Ministry Calendar sources (org calendar,
// Birthdays, Holidays, etc) from their own view. Missing preference row =
// visible (fail open); hiding a source persists a row, showing it again
// deletes it — same convention as CategoryVisibilityConfig.
//
// Renders as a section of CalendarSidebar (no card chrome of its own).

import { motion } from 'framer-motion'
import { useCalendarSourcePreferences } from '../hooks/useCalendarSourcePreferences'
import Toggle from './Toggle'
import { FONT_BODY } from '../lib/fonts'

export default function CalendarSourcesPanel() {
  const { sources, hiddenSourceIds, loading, error, toggleVisibility } = useCalendarSourcePreferences()

  // No section at all before an admin has connected anything to show.
  if (!loading && sources.length === 0) return null

  return (
    <div style={{ fontFamily: FONT_BODY, borderTop: '1px solid var(--border-light)', paddingBottom: 6 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          padding: '10px 14px 6px',
          userSelect: 'none',
        }}
      >
        Calendar Sources
      </div>

      {error && (
        <div style={{ padding: '8px 14px', background: 'var(--coral-light)', color: 'var(--coral-dark)', fontSize: 12, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '6px 14px 8px', color: 'var(--text-tertiary)', fontSize: 12.5 }}>
          Loading…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sources.map((source, index) => {
            const hidden = hiddenSourceIds.has(source.id)
            return (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, y: 4, backgroundColor: 'rgba(242, 238, 230, 0)' }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ backgroundColor: 'rgba(242, 238, 230, 1)' }}
                transition={{ duration: 0.18, delay: index * 0.03 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '5px 14px',
                  minHeight: 28,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: source.color || 'var(--accent)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 450 }}>
                  {source.display_name}
                </span>
                <Toggle
                  checked={!hidden}
                  onChange={() => toggleVisibility(source.id, hidden)}
                  label={`Show ${source.display_name} on my calendar`}
                />
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
