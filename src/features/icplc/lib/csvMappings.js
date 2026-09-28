// Versioned CSV header → canonical icplc_participants field mappings.
// PARTICIPATION IS NOT HERE — participation_status is Nexus/staff-managed only.
// If a CSV has a "Participation" column its value is stored as
// source_values.participation_reference metadata (never applied to any column).

export const CSV_MAPPING_V1 = {
  // Identity / demographic
  'Full Name':        'full_name',
  'Name':             'full_name',
  'Email':            'email',
  'Email Address':    'email',
  'Region':           'region',
  'Subgroup':         'subgroup',
  'Sub Group':        'subgroup',
  'Group':            'group_name',
  'Group Name':       'group_name',
  'Fellowship':       'group_name',
  'Leadership':       'leadership',
  'Leadership Category': 'leadership',

  // Registration
  'Registration Status': 'registration_status',
  'Reg Status':          'registration_status',

  // Flight / travel
  'Arrival Date':      'arrival_date',
  'Arrival Time':      'arrival_time',
  'Arrival Flight':    'arrival_flight',
  'Departure Date':    'departure_date',
  'Departure Time':    'departure_time',
  'Departure Flight':  'departure_flight',
}

// Fields that a CSV may update (with override protection).
// Fields NOT in this set are NEVER written by import processing regardless of column name.
export const CSV_MUTABLE_FIELDS = new Set([
  'registration_status',
  'arrival_date',
  'arrival_time',
  'arrival_flight',
  'departure_date',
  'departure_time',
  'departure_flight',
])

// Fields that CMP registrations may update.
export const CMP_REGISTRATIONS_MUTABLE_FIELDS = new Set([
  'registration_status',
  'passport_readiness',
  'visa_process_status',
])

// Fields that CMP flights may update.
export const CMP_FLIGHTS_MUTABLE_FIELDS = new Set([
  'arrival_date',
  'arrival_time',
  'arrival_flight',
  'departure_date',
  'departure_time',
  'departure_flight',
])

export const MUTABLE_FIELDS_BY_SOURCE = {
  csv:               CSV_MUTABLE_FIELDS,
  cmp_registrations: CMP_REGISTRATIONS_MUTABLE_FIELDS,
  cmp_flights:       CMP_FLIGHTS_MUTABLE_FIELDS,
}

export const MAPPING_VERSIONS = {
  v1: CSV_MAPPING_V1,
}

/**
 * Normalize a raw CSV header to a canonical field name, or null if unmapped.
 * Looks up by exact match, then trims whitespace.
 */
export function mapHeader(header, version = 'v1') {
  const mapping = MAPPING_VERSIONS[version] || CSV_MAPPING_V1
  const trimmed = header?.trim()
  return mapping[trimmed] ?? null
}

/**
 * Returns true if the header is the CSV's "Participation" column.
 * Its value is stored as source_values.participation_reference — never applied.
 */
export function isParticipationReferenceHeader(header) {
  const h = header?.trim().toLowerCase()
  return h === 'participation' || h === 'participation status'
}
