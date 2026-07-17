// Pure date/time helpers for the time-blocking Planner.
// All "date" values passed around are ISO date strings (yyyy-mm-dd) and all
// "time" values are Postgres time strings (HH:MM:SS) so they compare
// correctly as plain strings and round-trip to Supabase unchanged.

export const MINUTES_PER_DAY = 24 * 60

export function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // Sunday
  return d
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function addDaysISO(iso, n) {
  return toISODate(addDays(fromISODate(iso), n))
}

export function parseTimeToMinutes(time) {
  if (!time) return 0
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes) {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, minutes))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

export function blockDurationMinutes(block) {
  return parseTimeToMinutes(block.scheduled_end_time) - parseTimeToMinutes(block.scheduled_start_time)
}

function fmtClock(mins) {
  const h24 = Math.floor(mins / 60) % 24
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(mins % 60).padStart(2, '0')}`
}

function meridiem(mins) {
  return (Math.floor(mins / 60) % 24) >= 12 ? 'PM' : 'AM'
}

// "2:00 – 3:30 PM" (meridiem shown once when both ends share it)
export function formatTimeRange(startTime, endTime) {
  const start = parseTimeToMinutes(startTime)
  const end = parseTimeToMinutes(endTime)
  const sameMeridiem = meridiem(start) === meridiem(end) && end < MINUTES_PER_DAY
  if (sameMeridiem) return `${fmtClock(start)} – ${fmtClock(end)} ${meridiem(end)}`
  return `${fmtClock(start)} ${meridiem(start)} – ${fmtClock(end)} ${meridiem(end)}`
}

export function formatHourLabel(hour) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12} ${hour >= 12 ? 'PM' : 'AM'}`
}

// Minutes from the parent block's start to the child block's start.
// Cross-day links are expressed in whole-day increments of minutes.
export function computeOffsetMinutes(parentBlock, childBlock) {
  const dayDiff = Math.round(
    (fromISODate(childBlock.scheduled_date) - fromISODate(parentBlock.scheduled_date)) / 86400000,
  )
  return (
    dayDiff * MINUTES_PER_DAY +
    parseTimeToMinutes(childBlock.scheduled_start_time) -
    parseTimeToMinutes(parentBlock.scheduled_start_time)
  )
}

// Given the parent's new position, produce the child's new schedule with the
// stored offset preserved. Blocks may not span midnight (DB constraint), so a
// child pushed past midnight is clamped to end at 24:00 of its landing day.
export function applyOffsetToChild(newParentDateISO, newParentStartTime, childBlock, offsetMinutes) {
  const duration = blockDurationMinutes(childBlock)
  const offset = offsetMinutes ?? childBlock.time_offset_from_parent ?? 0
  const absoluteStart = parseTimeToMinutes(newParentStartTime) + offset
  const dayShift = Math.floor(absoluteStart / MINUTES_PER_DAY)
  let startWithinDay = absoluteStart - dayShift * MINUTES_PER_DAY
  let endWithinDay = startWithinDay + duration
  if (endWithinDay > MINUTES_PER_DAY) {
    endWithinDay = MINUTES_PER_DAY
    startWithinDay = Math.max(0, endWithinDay - duration)
  }
  return {
    scheduled_date: addDaysISO(newParentDateISO, dayShift),
    scheduled_start_time: minutesToTime(startWithinDay),
    scheduled_end_time: minutesToTime(endWithinDay),
  }
}

// Lay overlapping blocks of one day out into side-by-side lanes.
// Returns a map of block.id -> { lane, laneCount } for rendering widths.
export function computeLanes(blocks) {
  const sorted = [...blocks].sort(
    (a, b) =>
      parseTimeToMinutes(a.scheduled_start_time) - parseTimeToMinutes(b.scheduled_start_time) ||
      parseTimeToMinutes(b.scheduled_end_time) - parseTimeToMinutes(a.scheduled_end_time),
  )
  const layout = {}
  let cluster = []
  let clusterEnd = -1
  let laneEnds = []

  const flushCluster = () => {
    for (const entry of cluster) layout[entry.id] = { lane: entry.lane, laneCount: laneEnds.length }
    cluster = []
    laneEnds = []
  }

  for (const block of sorted) {
    const start = parseTimeToMinutes(block.scheduled_start_time)
    const end = parseTimeToMinutes(block.scheduled_end_time)
    if (start >= clusterEnd && cluster.length > 0) flushCluster()
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    cluster.push({ id: block.id, lane })
    clusterEnd = Math.max(clusterEnd, end)
  }
  if (cluster.length > 0) flushCluster()
  return layout
}

export function snapMinutes(minutes, step = 15) {
  return Math.round(minutes / step) * step
}

// Single source of truth for split eligibility — used by both the handler and the menu.
// A block is splittable when it is timed, has no linked subtask-blocks anchored to it,
// and is at least 30 minutes long (so each half is at least 15 min after 15-min snap).
export function canSplitBlock(block, childBlocksByParentId = {}) {
  if (block.is_all_day) return false
  if ((childBlocksByParentId[block.id] ?? []).length > 0) return false
  return (parseTimeToMinutes(block.scheduled_end_time) - parseTimeToMinutes(block.scheduled_start_time)) >= 30
}
