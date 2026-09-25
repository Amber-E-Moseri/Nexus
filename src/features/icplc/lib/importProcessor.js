// CSV parsing and identity key normalization for ICPLC imports.
// This module runs in the browser (normalization only — no authority decisions).
// Authority decisions happen server-side in icplc_preview_import RPC / Edge Function.

import { mapHeader, isParticipationReferenceHeader } from './csvMappings.js'

/**
 * Normalize a string for identity key comparison.
 * Lowercase, trim, collapse internal whitespace.
 */
export function normalizeKey(str) {
  if (!str) return ''
  return str.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Derive a stable identity key from a raw CSV row.
 * Priority: email > normalized full name.
 * Returns a string of the form "email:<email>" or "name:<normalized_name>".
 */
export function deriveIdentityKey(rawRow, headerMapping) {
  const mapped = applyHeaderMapping(rawRow, headerMapping)
  if (mapped.email) {
    return `email:${normalizeKey(mapped.email)}`
  }
  if (mapped.full_name) {
    return `name:${normalizeKey(mapped.full_name)}`
  }
  return null
}

/**
 * Apply a header mapping to a raw CSV row object.
 * Returns a new object with canonical field names.
 * "Participation" columns are stored under 'participation_reference' and
 * never mapped to participation_status.
 */
export function applyHeaderMapping(rawRow, headerMapping) {
  const result = { _raw: rawRow }
  for (const [header, value] of Object.entries(rawRow)) {
    if (isParticipationReferenceHeader(header)) {
      result.participation_reference = value
      continue
    }
    const canonical = headerMapping[header.trim()]
    if (canonical) {
      result[canonical] = value
    }
  }
  return result
}

/**
 * Parse CSV text into an array of row objects.
 * First row is treated as headers.
 * Returns { rows: Array<object>, headers: string[], errors: string[] }.
 */
export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    return { rows: [], headers: [], errors: ['CSV has no data rows'] }
  }

  const headers = splitCSVLine(lines[0])
  const rows = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = splitCSVLine(lines[i])
      const row = {}
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? ''
      })
      rows.push(row)
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err.message}`)
    }
  }

  return { rows, headers, errors }
}

/**
 * Minimal RFC 4180 CSV line splitter.
 * Handles quoted fields containing commas and escaped quotes.
 */
function splitCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Build the normalized header mapping for a CSV file given the set of headers.
 * Returns { mapping: { rawHeader: canonicalField }, unmapped: string[], participationHeaders: string[] }
 */
export function buildHeaderMapping(headers, mappingVersion = 'v1') {
  const mapping = {}
  const unmapped = []
  const participationHeaders = []

  for (const h of headers) {
    if (isParticipationReferenceHeader(h)) {
      participationHeaders.push(h)
      continue
    }
    const canonical = mapHeader(h, mappingVersion)
    if (canonical) {
      mapping[h] = canonical
    } else {
      unmapped.push(h)
    }
  }

  return { mapping, unmapped, participationHeaders }
}
