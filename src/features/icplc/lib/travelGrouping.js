// Grouping helpers for the Travel "By day" view (mirrors the R/F Transportation tab).

export function timeToMinutes(raw) {
  if (!raw) return Infinity
  const s = String(raw).trim()
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    if (/pm/i.test(ampm[3]) && h !== 12) h += 12
    if (/am/i.test(ampm[3]) && h === 12) h = 0
    return h * 60 + m
  }
  const iso = s.match(/T(\d{2}):(\d{2})/)
  if (iso) return parseInt(iso[1], 10) * 60 + parseInt(iso[2], 10)
  const h24 = s.match(/^(\d{1,2}):(\d{2})/)
  if (h24) return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10)
  return Infinity
}

export function fmtTime(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const ampm = s.match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/i)
  if (ampm) return `${ampm[1]} ${ampm[2].toUpperCase()}`
  const m = s.match(/T(\d{2}):(\d{2})/) || s.match(/^(\d{1,2}):(\d{2})/)
  if (m) {
    const h = parseInt(m[1], 10)
    return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`
  }
  return s
}

// Splits a time-sorted list into bands of people whose times are within
// `thresholdMinutes` of the previous person (possible shared pickup).
export function groupIntoBands(people, timeKey, thresholdMinutes = 15) {
  const bands = []
  let current = []
  people.forEach((p) => {
    const mins = timeToMinutes(p[timeKey])
    if (current.length > 0) {
      const prev = timeToMinutes(current[current.length - 1][timeKey])
      if (mins === Infinity || prev === Infinity || mins - prev > thresholdMinutes) {
        bands.push(current)
        current = []
      }
    }
    current.push(p)
  })
  if (current.length) bands.push(current)
  return bands
}

// Returns [[date | 'Unknown', people[]], ...] sorted by date, people sorted by time.
export function groupByDate(people, dateKey, timeKey, flightKey) {
  const groups = {}
  people
    .filter((p) => p[dateKey] || p[flightKey])
    .forEach((p) => {
      const key = p[dateKey] || 'Unknown'
      ;(groups[key] ||= []).push(p)
    })
  Object.values(groups).forEach((g) =>
    g.sort((a, b) => timeToMinutes(a[timeKey]) - timeToMinutes(b[timeKey])),
  )
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === 'Unknown') return 1
    if (b === 'Unknown') return -1
    return a.localeCompare(b)
  })
}
