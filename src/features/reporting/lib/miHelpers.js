/**
 * Color palette for attendance frequency breakdown
 */
export const MI_COLORS = {
  freq3Plus: '#4C2A92', // Primary purple — consistent attenders
  freq3: '#5DCAA5', // Teal — exactly 3 times
  freq1to2: '#EF9F27', // Orange — occasional
  inactive: '#E5DACC', // Gray — no attendance
}

/**
 * Friendly labels for frequency categories
 */
export const FREQ_LABELS = {
  in_system_total: 'In system',
  in_system_inactive: 'No attendance',
  active: 'Active',
  freq_once: 'Once',
  freq_twice: 'Twice',
  freq_thrice: '3 times',
  freq_three_plus: '3+ times',
}

/**
 * Get color for frequency bucket
 */
export function getFreqColor(freqKey) {
  if (freqKey === 'freq_three_plus') return MI_COLORS.freq3Plus
  if (freqKey === 'freq_thrice') return MI_COLORS.freq3
  if (freqKey === 'freq_twice' || freqKey === 'freq_once') return MI_COLORS.freq1to2
  if (freqKey === 'in_system_inactive') return MI_COLORS.inactive
  return '#D0D0D0'
}

/**
 * Format date range label
 */
export function formatDateRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return '—'
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  return `${from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

/**
 * Calculate date range (predefined or custom)
 */
export function getDateRange(preset = '6m', customFrom = null, customTo = null) {
  const today = new Date()
  const dateTo = new Date(today)
  dateTo.setHours(23, 59, 59, 999)

  let dateFrom
  if (preset === 'custom') {
    dateFrom = new Date(customFrom)
  } else if (preset === '3m') {
    dateFrom = new Date(today)
    dateFrom.setMonth(dateFrom.getMonth() - 3)
  } else {
    // default: 6 months
    dateFrom = new Date(today)
    dateFrom.setMonth(dateFrom.getMonth() - 6)
  }

  dateFrom.setHours(0, 0, 0, 0)

  return {
    dateFrom: dateFrom.toISOString().split('T')[0],
    dateTo: dateTo.toISOString().split('T')[0],
  }
}

/**
 * Format percentage with optional decimal places
 */
export function formatPercent(value, total, decimals = 0) {
  if (!total || total === 0) return '0%'
  const pct = (value / total) * 100
  return `${pct.toFixed(decimals)}%`
}
