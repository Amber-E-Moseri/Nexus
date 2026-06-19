export interface AttendanceRecord {
  meeting_name: string
  date: string
  time?: string
  person_name: string
  person_id?: string
  status: 'present' | 'absent' | 'late' | 'excused'
  attendance_percentage?: number
}

interface ParseError {
  row: number
  error: string
}

export interface ParseResult {
  records: AttendanceRecord[]
  errors: ParseError[]
  summary: {
    total_rows: number
    valid_records: number
    invalid_rows: number
  }
}

const REQUIRED_COLUMNS = ['Meeting', 'Date', 'PersonName', 'Status']

function normalizeStatus(status: string): 'present' | 'absent' | 'late' | 'excused' {
  const normalized = status?.trim().toLowerCase() || 'absent'
  const mapping: Record<string, 'present' | 'absent' | 'late' | 'excused'> = {
    'present': 'present',
    'p': 'present',
    'absent': 'absent',
    'a': 'absent',
    'late': 'late',
    'l': 'late',
    'excused': 'excused',
    'e': 'excused',
  }
  return mapping[normalized] || 'absent'
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null

  try {
    // Handle various date formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
    const trimmed = dateStr.trim()
    let date: Date

    if (trimmed.includes('-')) {
      // ISO format: 2024-06-16
      date = new Date(trimmed)
    } else if (trimmed.includes('/')) {
      // MM/DD/YYYY or DD/MM/YYYY - try both
      const parts = trimmed.split('/')
      if (parts.length === 3) {
        // Assume MM/DD/YYYY for now (Elvanto format)
        const [month, day, year] = parts
        date = new Date(`${year}-${month}-${day}`)
      } else {
        return null
      }
    } else {
      // Try direct parse
      date = new Date(trimmed)
    }

    if (isNaN(date.getTime())) return null

    // Return ISO format
    return date.toISOString().split('T')[0]
  } catch {
    return null
  }
}

function parsePercentage(pctStr: string): number | undefined {
  if (!pctStr) return undefined

  try {
    const normalized = pctStr.trim().replace('%', '')
    const num = parseFloat(normalized)
    if (isNaN(num)) return undefined
    return Math.min(100, Math.max(0, num))
  } catch {
    return undefined
  }
}

export function parseElvantoCSV(csvText: string): ParseResult {
  const records: AttendanceRecord[] = []
  const errors: ParseError[] = []

  if (!csvText || typeof csvText !== 'string') {
    return {
      records: [],
      errors: [{ row: 0, error: 'Invalid CSV input' }],
      summary: { total_rows: 0, valid_records: 0, invalid_rows: 1 },
    }
  }

  const lines = csvText.trim().split('\n')
  if (lines.length < 2) {
    return {
      records: [],
      errors: [{ row: 0, error: 'CSV file is empty or contains only headers' }],
      summary: { total_rows: 0, valid_records: 0, invalid_rows: 0 },
    }
  }

  // Parse header
  const headerLine = lines[0]
  const headers = headerLine.split(',').map((h) => h.trim())

  // Find column indices (case-insensitive)
  const headerMap: Record<string, number> = {}
  const headerLower = headers.map((h) => h.toLowerCase())

  const expectedHeaders = {
    meeting: ['meeting', 'meeting_name', 'meeting name'],
    date: ['date', 'meeting date', 'date of meeting'],
    time: ['time', 'start time', 'meeting time'],
    person_name: ['personname', 'person name', 'name', 'person', 'attendee'],
    person_id: ['personid', 'person id', 'external_id', 'elvanto_id'],
    status: ['status', 'attendance', 'attendance status'],
    percentage: ['percentage', 'percent', 'attendance %', 'percentage %'],
  }

  for (const [key, aliases] of Object.entries(expectedHeaders)) {
    const idx = headerLower.findIndex((h) => aliases.includes(h))
    if (idx !== -1) {
      headerMap[key] = idx
    }
  }

  // Check required columns
  const missingColumns = REQUIRED_COLUMNS.filter(
    (col) => !Object.values(headerMap).includes(headerLower.indexOf(col.toLowerCase())),
  )

  if (
    headerMap['meeting'] === undefined ||
    headerMap['date'] === undefined ||
    headerMap['person_name'] === undefined ||
    headerMap['status'] === undefined
  ) {
    const missing = []
    if (headerMap['meeting'] === undefined) missing.push('Meeting')
    if (headerMap['date'] === undefined) missing.push('Date')
    if (headerMap['person_name'] === undefined) missing.push('PersonName')
    if (headerMap['status'] === undefined) missing.push('Status')

    return {
      records: [],
      errors: [{ row: 0, error: `CSV missing required columns: ${missing.join(', ')}` }],
      summary: { total_rows: lines.length - 1, valid_records: 0, invalid_rows: lines.length - 1 },
    }
  }

  // Parse data rows
  let validCount = 0
  let invalidCount = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue // Skip empty lines

    try {
      const cols = line.split(',').map((c) => c.trim())

      const meetingName = cols[headerMap['meeting']]?.trim()
      const dateStr = cols[headerMap['date']]?.trim()
      const timeStr = cols[headerMap['time']]?.trim()
      const personName = cols[headerMap['person_name']]?.trim()
      const personId = cols[headerMap['person_id']]?.trim()
      const statusStr = cols[headerMap['status']]?.trim()
      const percentStr = cols[headerMap['percentage']]?.trim()

      // Validate required fields
      if (!meetingName || !dateStr || !personName || !statusStr) {
        errors.push({
          row: i + 1,
          error: `Missing required field(s): ${!meetingName ? 'Meeting ' : ''}${!dateStr ? 'Date ' : ''}${!personName ? 'PersonName ' : ''}${!statusStr ? 'Status' : ''}`,
        })
        invalidCount++
        continue
      }

      const parsedDate = parseDate(dateStr)
      if (!parsedDate) {
        errors.push({
          row: i + 1,
          error: `Invalid date format: "${dateStr}" (expected YYYY-MM-DD or MM/DD/YYYY)`,
        })
        invalidCount++
        continue
      }

      const record: AttendanceRecord = {
        meeting_name: meetingName,
        date: parsedDate,
        person_name: personName,
        status: normalizeStatus(statusStr),
      }

      if (timeStr) record.time = timeStr
      if (personId) record.person_id = personId
      if (percentStr) {
        const pct = parsePercentage(percentStr)
        if (pct !== undefined) record.attendance_percentage = pct
      }

      records.push(record)
      validCount++
    } catch (err) {
      errors.push({
        row: i + 1,
        error: `Error parsing row: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
      invalidCount++
    }
  }

  return {
    records,
    errors,
    summary: {
      total_rows: lines.length - 1,
      valid_records: validCount,
      invalid_rows: invalidCount,
    },
  }
}
