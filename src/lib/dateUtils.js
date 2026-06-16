import {
  differenceInCalendarDays,
  format,
  isToday,
  isTomorrow,
  isWithinInterval,
  isYesterday,
  parseISO,
} from 'date-fns'

function parseDateValue(dateString) {
  if (!dateString) return null
  if (dateString instanceof Date) return dateString
  if (typeof dateString !== 'string') return null

  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return parseISO(`${dateString}T00:00:00`)
    }
    return parseISO(dateString)
  } catch {
    return null
  }
}

function hasExplicitTime(dateString) {
  return typeof dateString === 'string' && /T\d{2}:\d{2}/.test(dateString)
}

export function formatRelativeDate(dateString, options = {}) {
  const value = parseDateValue(dateString)
  if (!value) return null

  const today = new Date()
  let label

  if (isToday(value)) {
    label = 'Today'
  } else if (isYesterday(value)) {
    label = 'Yesterday'
  } else if (isTomorrow(value)) {
    label = 'Tomorrow'
  } else if (
    isWithinInterval(value, {
      start: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6),
      end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6, 23, 59, 59, 999),
    })
  ) {
    label = format(value, 'EEEE')
  } else if (value.getFullYear() === today.getFullYear()) {
    label = format(value, 'MMM d')
  } else {
    label = format(value, 'MMM d, yyyy')
  }

  if (options.includeTime && hasExplicitTime(dateString)) {
    return `${label} at ${format(value, 'h:mm a')}`
  }

  return label
}

export function formatDueDate(dateString) {
  const value = parseDateValue(dateString)
  if (!value) return { label: null, status: 'normal' }

  const today = new Date()
  const dayDelta = differenceInCalendarDays(value, today)

  let status = 'normal'
  if (dayDelta < 0) {
    status = 'overdue'
  } else if (dayDelta === 0) {
    status = 'today'
  } else if (dayDelta <= 3) {
    status = 'soon'
  }

  return {
    label: formatRelativeDate(dateString),
    status,
  }
}

export function formatDuration(minutes) {
  const totalMinutes = Number(minutes) || 0
  if (totalMinutes <= 0) return null

  const hours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60

  if (hours === 0) return `${remainingMinutes} min`
  if (remainingMinutes === 0) return `${hours} h`
  return `${hours} h ${remainingMinutes} min`
}

export function formatLastActive(isoTimestamp) {
  const value = parseDateValue(isoTimestamp)
  if (!value) return 'Never'

  const diffMs = Date.now() - value.getTime()
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMs < 3600000) return 'Just now'
  if (diffMs < 86400000) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffMs < 604800000) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  return formatRelativeDate(isoTimestamp)
}
