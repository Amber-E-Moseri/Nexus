import { addDays, addWeeks, addMonths, setDate, lastDayOfMonth, getDate } from 'date-fns'

export const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Safety cap so a "never ending" series (or a runaway occurrence count) can't
// insert an unbounded number of meeting rows.
export const MAX_OCCURRENCES = 52

const DAY_MAP = { Sun: 'SU', Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA' }

export function buildRecurrenceRule(recurring, recurrenceData) {
  if (!recurring || recurrenceData.frequency === 'none') return null

  let rule = `FREQ=${recurrenceData.frequency.toUpperCase()}`
  if (recurrenceData.frequency === 'bi-weekly') {
    rule = 'FREQ=WEEKLY;INTERVAL=2'
  }

  if (recurrenceData.frequency === 'weekly' || recurrenceData.frequency === 'bi-weekly') {
    if (recurrenceData.daysOfWeek.size > 0) {
      const days = Array.from(recurrenceData.daysOfWeek).map((d) => DAY_MAP[d]).join(',')
      rule += `;BYDAY=${days}`
    }
  } else if (recurrenceData.frequency === 'monthly') {
    rule += `;BYMONTHDAY=${recurrenceData.dayOfMonth}`
  }

  if (recurrenceData.endType === 'occurrences') {
    rule += `;COUNT=${Math.min(recurrenceData.occurrences, MAX_OCCURRENCES)}`
  } else if (recurrenceData.endType === 'date') {
    const dateStr = recurrenceData.endDate.replace(/-/g, '')
    rule += `;UNTIL=${dateStr}T000000Z`
  } else if (recurrenceData.endType === 'never') {
    rule += `;COUNT=${MAX_OCCURRENCES}`
  }

  return rule
}

// Returns an array of Date objects (same time-of-day as `startDateTime`), first
// entry always equal to `startDateTime`.
export function generateOccurrenceDates(startDateTime, recurrenceData, { maxOccurrences = MAX_OCCURRENCES } = {}) {
  const { frequency, daysOfWeek, dayOfMonth, endType, occurrences, endDate } = recurrenceData

  const hardCap = endType === 'occurrences' ? Math.min(occurrences, maxOccurrences) : maxOccurrences
  const untilDate = endType === 'date' ? new Date(`${endDate}T23:59:59`) : null

  if (frequency === 'none') return [startDateTime]

  const dates = []

  if ((frequency === 'weekly' || frequency === 'bi-weekly') && daysOfWeek.size > 0) {
    const weekStep = frequency === 'bi-weekly' ? 2 : 1
    const selectedDayIndexes = new Set(Array.from(daysOfWeek).map((d) => DAYS_OF_WEEK.indexOf(d)))
    let cur = startDateTime
    let weekIndex = 0
    while (dates.length < hardCap) {
      if (selectedDayIndexes.has(cur.getDay()) && (weekIndex % weekStep === 0)) {
        if (untilDate && cur > untilDate) break
        dates.push(cur)
      }
      const next = addDays(cur, 1)
      if (next.getDay() === 0 && cur.getDay() !== 0) weekIndex += 1
      cur = next
      if (untilDate && cur > untilDate) break
    }
    return dates
  }

  let cur = startDateTime
  while (dates.length < hardCap) {
    if (untilDate && cur > untilDate) break
    dates.push(cur)

    if (frequency === 'daily') {
      cur = addDays(cur, 1)
    } else if (frequency === 'weekly') {
      cur = addWeeks(cur, 1)
    } else if (frequency === 'bi-weekly') {
      cur = addWeeks(cur, 2)
    } else if (frequency === 'monthly') {
      const advanced = addMonths(cur, 1)
      const targetDay = Math.min(dayOfMonth, getDate(lastDayOfMonth(advanced)))
      cur = setDate(advanced, targetDay)
    } else {
      break
    }
  }

  return dates
}
