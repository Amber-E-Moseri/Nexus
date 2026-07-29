/**
 * AppScript integration helpers for "This Is It 2.0" registration
 * Handles bidirectional and one-way syncing with Google Sheets
 */

/**
 * Parse CSV text from Google Sheets export
 * @param {string} csvText - CSV text to parse
 * @returns {Array} Array of row objects
 */
export function parseSheetCSV(csvText) {
  if (!csvText || !csvText.trim()) return []

  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',')
    const row = {}
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim()
    })
    rows.push(row)
  }

  return rows
}

/**
 * Format data for Google Sheets export (CSV format)
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Column definitions [{key: 'name', label: 'Full Name'}, ...]
 * @returns {string} CSV text
 */
export function formatSheetCSV(data, columns) {
  const headers = columns.map(c => c.label || c.key).join(',')
  const rows = data.map(row => {
    return columns.map(col => {
      const value = typeof col.get === 'function' ? col.get(row) : row[col.key]
      const str = String(value || '').replace(/"/g, '""')
      return /[,"\n]/.test(str) ? `"${str}"` : str
    }).join(',')
  })

  return [headers, ...rows].join('\n')
}

/**
 * Sync data one-way from Google Sheets to app
 * Creates new records from sheet data that don't exist locally
 * @param {Array} sheetData - Data from Google Sheets
 * @param {Array} existingData - Existing app data (by key field)
 * @param {string} keyField - Field to use for deduplication (e.g., 'email')
 * @returns {Object} {added: Array, updated: Array, unchanged: Array}
 */
export function syncOneWayFromSheet(sheetData, existingData, keyField = 'email') {
  const existingMap = new Map(
    existingData.map(item => [item[keyField]?.toLowerCase?.() || item[keyField], item])
  )

  const result = { added: [], updated: [], unchanged: [] }

  for (const sheetItem of sheetData) {
    const key = sheetItem[keyField]?.toLowerCase?.() || sheetItem[keyField]
    if (!key) continue

    const existing = existingMap.get(key)
    if (!existing) {
      result.added.push(sheetItem)
    } else {
      result.unchanged.push(sheetItem)
    }
  }

  return result
}

/**
 * Sync data bidirectionally between sheet and app
 * Sheet data takes precedence for conflicts
 * @param {Array} sheetData - Data from Google Sheets
 * @param {Array} appData - Existing app data
 * @param {string} keyField - Field to use for matching
 * @param {Function} mergeConflict - Custom merge function for conflicts
 * @returns {Object} {added: Array, updated: Array, deleted: Array}
 */
export function syncBidirectional(sheetData, appData, keyField = 'email', mergeConflict = null) {
  const sheetMap = new Map(
    sheetData.map(item => [item[keyField]?.toLowerCase?.() || item[keyField], item])
  )

  const appMap = new Map(
    appData.map(item => [item[keyField]?.toLowerCase?.() || item[keyField], item])
  )

  const result = { added: [], updated: [], deleted: [] }

  // Process sheet data
  for (const [key, sheetItem] of sheetMap) {
    const appItem = appMap.get(key)
    if (!appItem) {
      result.added.push(sheetItem)
    } else {
      // Merge: sheet data takes precedence
      const merged = mergeConflict
        ? mergeConflict(appItem, sheetItem)
        : { ...appItem, ...sheetItem }
      if (JSON.stringify(appItem) !== JSON.stringify(merged)) {
        result.updated.push(merged)
      }
    }
  }

  // Find deleted items (in app but not in sheet)
  for (const [key, appItem] of appMap) {
    if (!sheetMap.has(key)) {
      result.deleted.push(appItem)
    }
  }

  return result
}

/**
 * Map registration form data to standardized format
 * Normalizes various header spellings and formats
 * @param {Array} formData - Raw form submissions from sheet
 * @returns {Array} Normalized registration records
 */
export function normalizeRegistrationData(formData) {
  const ALIASES = {
    firstName: [/first.?name/i, /given.?name/i],
    lastName: [/last.?name/i, /family.?name/i, /surname/i],
    email: [/email/i, /e-mail/i],
    phone: [/phone/i, /contact/i, /mobile/i],
    subgroup: [/subgroup/i, /unit/i, /group/i, /team/i],
    fellowship: [/fellowship/i, /church/i, /congregation/i],
    arrivalDate: [/arrival.*date/i],
    arrivalTime: [/arrival.*time/i],
    departureDate: [/depart.*date/i],
    departureTime: [/depart.*time/i],
  }

  return formData.map(row => {
    const normalized = {}
    const keys = Object.keys(row)

    for (const [field, patterns] of Object.entries(ALIASES)) {
      const match = keys.find(k => patterns.some(p => p.test(k)))
      normalized[field] = match ? (row[match] || '').toString().trim() : ''
    }

    normalized.email = normalized.email.toLowerCase()
    normalized.fullName = [normalized.firstName, normalized.lastName]
      .filter(Boolean)
      .join(' ')

    return normalized
  })
}

/**
 * Prepare registration data for Google Sheets export
 * Formats arrays of registrations into a sheet-ready CSV
 * @param {Array} registrations - Registration records to export
 * @returns {string} CSV formatted data
 */
export function prepareRegistrationExport(registrations) {
  const columns = [
    { key: 'fullName', label: 'Full Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'subgroup', label: 'Subgroup' },
    { key: 'fellowship', label: 'Fellowship' },
    { key: 'arrivalDate', label: 'Arrival Date' },
    { key: 'arrivalTime', label: 'Arrival Time' },
    { key: 'departureDate', label: 'Departure Date' },
    { key: 'departureTime', label: 'Departure Time' },
  ]

  return formatSheetCSV(registrations, columns)
}

/**
 * Transform data from AppScript-provided JSON into registration objects
 * Maps Google Form fields to Nexus registration format
 * @param {Array} appScriptData - Clean registration data from AppScript
 * @returns {Array} Normalized registration records
 */
export function transformAppScriptData(appScriptData) {
  return appScriptData.map(row => ({
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    fullName: [row.firstName, row.lastName].filter(Boolean).join(' '),
    email: (row.email || '').toLowerCase(),
    phone: row.phone || '',
    unit: row.unit || '',
    subgroup: row.subgroup || '',
    fellowship: row.fellowship || '',
    gender: row.gender || '',
    shirtSize: row.shirtSize || '',
    foundationStatus: row.foundationStatus || '',
    baptised: row.baptised || '',
    allergies: row.allergies || '',
    team: row.team || '',
    submittedAt: row.submittedAt || '',
  }))
}

/**
 * Create sync metadata for tracking last sync time and status
 * @param {string} syncType - 'import' | 'export' | 'bidirectional'
 * @param {number} recordCount - Number of records synced
 * @param {boolean} success - Whether sync succeeded
 * @param {string|null} error - Error message if failed
 * @returns {Object} Metadata object for storage
 */
export function createSyncMetadata(syncType, recordCount, success, error = null) {
  return {
    syncType,
    recordCount,
    success,
    error,
    timestamp: new Date().toISOString(),
    syncedAt: new Date().toLocaleString(),
  }
}

/**
 * Validate registration data before sync
 * Checks for required fields and data integrity
 * @param {Array} registrations - Registration records to validate
 * @returns {Object} {valid: boolean, errors: Array}
 */
export function validateRegistrations(registrations) {
  const errors = []
  const required = ['email', 'fullName']

  registrations.forEach((reg, idx) => {
    required.forEach(field => {
      if (!reg[field] || !String(reg[field]).trim()) {
        errors.push(`Row ${idx + 1}: Missing required field "${field}"`)
      }
    })

    if (reg.email && !isValidEmail(reg.email)) {
      errors.push(`Row ${idx + 1}: Invalid email "${reg.email}"`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
