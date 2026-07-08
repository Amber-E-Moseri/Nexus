// Calendar sidebar — unified left rail for the Ministry Calendar page.
// ClickUp-inspired interaction pattern: one panel with clear section
// hierarchy, hover-revealed action icons in the header (share / export /
// settings mirror the existing page-level controls, they don't replace
// them), and a staggered entrance. Visual layer only — every handler is
// passed in from MinistryCalendar unchanged.

import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Share2, Download, Settings } from 'lucide-react'
import { EVENT_COLORS } from './CalendarEventCard'
import CalendarSourcesPanel from './CalendarSourcesPanel'
import Toggle from './Toggle'
import { FONT_BODY, FONT_HEADING } from '../lib/fonts'

// Hex literals inside framer-motion animate targets mirror existing tokens
// (CSS vars aren't interpolable): #F2EEE6 = --surface-hover, #EDE8F8 =
// --accent-light, #4C2A92 = --accent.
const HOVER_BG = 'rgba(242, 238, 230, 1)'
const HOVER_BG_OFF = 'rgba(242, 238, 230, 0)'

const railStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
}

const sectionEnter = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 0.61, 0.36, 1] } },
}

// Width animates alongside opacity so hidden icons take no layout space —
// otherwise they'd squeeze the month label into ellipsis even when invisible.
const iconReveal = {
  rest: { opacity: 0, width: 0, x: 6, transition: { duration: 0.12 } },
  hover: { opacity: 1, width: 24, x: 0, transition: { duration: 0.16 } },
}

function HeaderIconButton({ title, onClick, children }) {
  return (
    <motion.button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      variants={iconReveal}
      whileHover={{ backgroundColor: '#EDE8F8', color: '#4C2A92' }}
      whileTap={{ scale: 0.9 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 24,
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </motion.button>
  )
}

function NavChevron({ title, onClick, children }) {
  return (
    <motion.button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      whileHover={{ backgroundColor: '#F2EEE6' }}
      whileTap={{ scale: 0.9 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </motion.button>
  )
}

export function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: FONT_BODY,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
        padding: '10px 14px 6px',
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  )
}

export default function CalendarSidebar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  eventTypes,
  selectedEventTypes,
  onToggleType,
  deptOnly,
  onDeptOnlyChange,
  onShare,
  onDownload,
  onOpenSettings,
}) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })

  return (
    <motion.aside
      variants={railStagger}
      initial="hidden"
      animate="show"
      style={{
        fontFamily: FONT_BODY,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'white',
        boxShadow: 'var(--card-shadow)',
        overflow: 'hidden',
      }}
    >
      {/* Header: month navigator + hover-revealed quick actions */}
      <motion.div variants={sectionEnter}>
        <motion.div
          initial="rest"
          animate="rest"
          whileHover="hover"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '12px 12px 12px 14px',
            borderBottom: '1px solid var(--border-light)',
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: FONT_HEADING,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {monthLabel}
          </div>

          <HeaderIconButton title="Copy subscribe link" onClick={onShare}>
            <Share2 size={13} />
          </HeaderIconButton>
          <HeaderIconButton title="Download .ics" onClick={onDownload}>
            <Download size={13} />
          </HeaderIconButton>
          {onOpenSettings ? (
            <HeaderIconButton title="Calendar settings" onClick={onOpenSettings}>
              <Settings size={13} />
            </HeaderIconButton>
          ) : null}

          <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

          <NavChevron title="Previous month" onClick={onPrevMonth}>
            <ChevronLeft size={15} />
          </NavChevron>
          <NavChevron title="Next month" onClick={onNextMonth}>
            <ChevronRight size={15} />
          </NavChevron>
        </motion.div>
      </motion.div>

      {/* Event type filters */}
      <motion.div variants={sectionEnter} style={{ paddingBottom: 6 }}>
        <SectionLabel>Event Types</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {eventTypes.map((type) => (
            <motion.label
              key={type}
              initial={{ backgroundColor: HOVER_BG_OFF }}
              whileHover={{ backgroundColor: HOVER_BG }}
              transition={{ duration: 0.13 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '5px 14px',
                minHeight: 28,
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-primary)',
              }}
            >
              <input
                type="checkbox"
                checked={selectedEventTypes.has(type)}
                onChange={(e) => onToggleType(type, e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: 13, height: 13, margin: 0, flexShrink: 0 }}
              />
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: EVENT_COLORS[type],
                  flexShrink: 0,
                }}
              />
              <span style={{ textTransform: 'capitalize', flex: 1, fontWeight: 450 }}>{type}</span>
            </motion.label>
          ))}
        </div>
      </motion.div>

      {/* Calendar sources (renders nothing until an admin connects a source) */}
      <motion.div variants={sectionEnter}>
        <CalendarSourcesPanel />
      </motion.div>

      {/* View filters */}
      <motion.div variants={sectionEnter} style={{ borderTop: '1px solid var(--border-light)', paddingBottom: 8 }}>
        <SectionLabel>Filters</SectionLabel>
        <motion.div
          initial={{ backgroundColor: HOVER_BG_OFF }}
          whileHover={{ backgroundColor: HOVER_BG }}
          transition={{ duration: 0.13 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '5px 14px',
            minHeight: 28,
          }}
        >
          <span
            onClick={() => onDeptOnlyChange(!deptOnly)}
            style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 450, userSelect: 'none' }}
          >
            My department only
          </span>
          <Toggle
            checked={deptOnly}
            onChange={() => onDeptOnlyChange(!deptOnly)}
            label="Show only my department's events"
          />
        </motion.div>
      </motion.div>
    </motion.aside>
  )
}
