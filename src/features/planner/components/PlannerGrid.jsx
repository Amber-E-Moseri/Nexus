import { useDroppable } from '@dnd-kit/core'
import TimeBlock from './TimeBlock'
import { BORDER, DAY_END_HOUR, DAY_START_HOUR, HOUR_HEIGHT, MUTED, PRIMARY, SLOT_HOVER, TEXT } from '../lib/plannerTheme'
import { computeLanes, formatHourLabel, parseTimeToMinutes, toISODate, addDays } from '../lib/timeBlockUtils'

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIME_COL = 52

function DroppableSlot({ id, height, borderTop }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        height,
        boxSizing: 'border-box',
        borderTop,
        background: isOver ? SLOT_HOVER : 'transparent',
        transition: 'background .1s',
      }}
    />
  )
}

function AllDayCell({ dateISO, blocks, taskById, severityByBlockId, onBlockClick, onBlockContextMenu }) {
  const { setNodeRef, isOver } = useDroppable({ id: `allday:${dateISO}` })
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 34,
        borderLeft: `1px solid ${BORDER}`,
        background: isOver ? SLOT_HOVER : 'transparent',
        padding: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      {blocks.map((b) => {
        const task = taskById[b.task_id]
        return (
          <div
            key={b.id}
            onClick={() => onBlockClick(b)}
            onContextMenu={(e) => { e.preventDefault(); onBlockContextMenu(e, b) }}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: TEXT,
              background: 'white',
              border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${severityByBlockId[b.id] ? '#C94830' : PRIMARY}`,
              borderRadius: 5,
              padding: '2px 6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {task?.title ?? '…'}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Weekly hourly grid (Sun–Sat, 6am–10pm) with an all-day row on top.
 * Timed blocks are absolutely positioned inside each day column; overlapping
 * blocks share the column width via lane layout.
 */
export default function PlannerGrid({
  weekStart,
  timeBlocks,
  taskById,
  severityByBlockId,
  linkedBlockIds,
  onBlockClick,
  onBlockContextMenu,
  onBlockResize,
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayISO = toISODate(new Date())
  const gridTop = DAY_START_HOUR * 60

  const blocksByDate = {}
  for (const b of timeBlocks) {
    if (b.is_all_day) continue
    ;(blocksByDate[b.scheduled_date] ??= []).push(b)
  }
  const allDayByDate = {}
  for (const b of timeBlocks) {
    if (!b.is_all_day) continue
    ;(allDayByDate[b.scheduled_date] ??= []).push(b)
  }

  return (
    <div style={{ flex: 1, minWidth: 0, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Day headers */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ width: TIME_COL, flexShrink: 0 }} />
        {days.map((d) => {
          const iso = toISODate(d)
          const isToday = iso === todayISO
          return (
            <div key={iso} style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '8px 0 6px', borderLeft: `1px solid ${BORDER}`, background: isToday ? SLOT_HOVER : 'transparent' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: isToday ? PRIMARY : MUTED }}>
                {DAY_NAMES[d.getDay()]}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: isToday ? PRIMARY : TEXT }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {/* All-day row */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${BORDER}` }}>
        <div style={{ width: TIME_COL, flexShrink: 0, fontSize: 9.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.04em', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>
          All day
        </div>
        {days.map((d) => {
          const iso = toISODate(d)
          return (
            <AllDayCell
              key={iso}
              dateISO={iso}
              blocks={allDayByDate[iso] ?? []}
              taskById={taskById}
              severityByBlockId={severityByBlockId}
              onBlockClick={onBlockClick}
              onBlockContextMenu={onBlockContextMenu}
            />
          )
        })}
      </div>

      {/* Hour grid */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {timeBlocks.length === 0 && (
          <div style={{ position: 'absolute', top: 18, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none', zIndex: 2 }}>
            <span style={{ background: SLOT_HOVER, color: PRIMARY, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '6px 14px' }}>
              No time blocks yet. Drag a task from the sidebar to get started.
            </span>
          </div>
        )}
        <div style={{ display: 'flex' }}>
          {/* Time labels */}
          <div style={{ width: TIME_COL, flexShrink: 0 }}>
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_HEIGHT, boxSizing: 'border-box', fontSize: 10.5, color: MUTED, textAlign: 'right', paddingRight: 6, paddingTop: 2, borderTop: `1px solid ${BORDER}` }}>
                {formatHourLabel(h)}
              </div>
            ))}
          </div>

          {days.map((d) => {
            const iso = toISODate(d)
            const dayBlocks = blocksByDate[iso] ?? []
            const lanes = computeLanes(dayBlocks)
            const isToday = iso === todayISO
            // Current-time indicator, only on today's column within visible hours
            const now = new Date()
            const nowMin = now.getHours() * 60 + now.getMinutes()
            const showNowLine = isToday && nowMin >= gridTop && nowMin < DAY_END_HOUR * 60
            return (
              <div key={iso} style={{ flex: 1, minWidth: 0, position: 'relative', borderLeft: `1px solid ${BORDER}`, background: isToday ? SLOT_HOVER : 'transparent' }}>
                {HOURS.map((h) => (
                  <DroppableSlot key={h} id={`slot:${iso}:${h}`} height={HOUR_HEIGHT} borderTop={`1px solid ${BORDER}`} />
                ))}
                {showNowLine && (
                  <div
                    aria-hidden="true"
                    style={{ position: 'absolute', left: 0, right: 0, top: ((nowMin - gridTop) / 60) * HOUR_HEIGHT, height: 2, background: '#C94830', zIndex: 4, pointerEvents: 'none' }}
                  >
                    <span style={{ position: 'absolute', left: -3, top: -3, width: 8, height: 8, borderRadius: '50%', background: '#C94830' }} />
                  </div>
                )}
                {dayBlocks.map((b) => {
                  const startMin = parseTimeToMinutes(b.scheduled_start_time)
                  const { lane = 0, laneCount = 1 } = lanes[b.id] ?? {}
                  const widthPct = 100 / laneCount
                  return (
                    <TimeBlock
                      key={b.id}
                      block={b}
                      task={taskById[b.task_id]}
                      severity={severityByBlockId[b.id] ?? null}
                      linked={linkedBlockIds.has(b.id)}
                      onClick={onBlockClick}
                      onContextMenu={onBlockContextMenu}
                      onResize={onBlockResize}
                      style={{
                        // Blocks outside visible hours (e.g. pushed past midnight
                        // by a parent move) pin to the grid edge instead of
                        // rendering off-canvas.
                        top: Math.max(0, ((startMin - gridTop) / 60) * HOUR_HEIGHT + 1),
                        left: `calc(${lane * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 5px)`,
                      }}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
