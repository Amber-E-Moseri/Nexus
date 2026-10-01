// Turns an activity_log row for an ICPLC participant into something staff can read:
// who did it, whether it was automatic, and each changed field as "from -> to".

export const FIELD_LABELS = {
  full_name: 'Name',
  email: 'Email',
  alternate_email: 'Alternate email',
  region: 'Campus / region',
  subgroup: 'Subgroup',
  group_name: 'Group',
  leadership: 'Leadership',
  notes: 'Notes',
  gender: 'Gender',
  kingschat_username: 'KingsChat handle',
  kingschat_user_id: 'KingsChat user ID',
  participation_status: 'Participation',
  registration_status: 'Registration',
  canada_residency_status: 'Canadian status',
  canada_status_document_readiness: 'Canadian document',
  passport_country: 'Passport country',
  passport_readiness: 'Passport',
  passport_region: 'Passport region',
  visa_requirement: 'Visa requirement',
  visa_process_status: 'Visa process',
  arrival_date: 'Arrival date',
  arrival_time: 'Arrival time',
  arrival_flight: 'Arrival flight',
  departure_date: 'Departure date',
  departure_time: 'Departure time',
  departure_flight: 'Departure flight',
  documentation_assistance_requested: 'Documentation assistance',
  flight_not_required_reason: 'Flight not required (reason)',
  flight_not_required_note: 'Flight not required (note)',
  documentation_review_at: 'Documentation review',
  documentation_review_fingerprint: 'Reviewed missing-information state',
}

const humanize = (v) => {
  const t = String(v).replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ''
}

// Fields whose values are a fixed vocabulary (tracking, not_started, ...): show them as words.
const ENUM_FIELDS = new Set(['participation_status', 'registration_status', 'passport_readiness', 'visa_requirement', 'visa_process_status', 'gender', 'passport_region'])

const VALUE_LABELS = {
  participation_status: { likely: 'Confirming', not_attending: 'Not attending' },
  visa_requirement: { review: 'Needs review' },
}

/** Human text for one stored value; blank/null reads as "empty". */
export function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return 'empty'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  const override = VALUE_LABELS[field]?.[value]
  if (override) return override
  if (ENUM_FIELDS.has(field)) return humanize(value)
  if (/^[A-Z0-9_]+$/.test(String(value))) return humanize(value) // CANADIAN_CITIZEN -> Canadian citizen
  if (/_/.test(String(value)) && !/\s/.test(String(value))) return humanize(value)
  const s = String(value)
  return s.length > 140 ? `${s.slice(0, 140)}…` : s
}

/**
 * @param {object} entry  activity_log row (metadata jsonb, optional joined `users`)
 * @returns {{ title: string, actor: string, automatic: boolean, bulk: boolean, reason: string|null, changes: {label:string, from:string, to:string}[] }}
 */
export function describeActivity(entry) {
  const meta = entry?.metadata || {}
  const automatic = meta.source === 'automatic'
  const bulk = meta.source === 'bulk_action'
  const system = meta.source === 'system'
  const user = entry?.users
  const person = user?.name || user?.email
  const actor = automatic
    ? `Automatic${person ? ` (triggered by ${person})` : ''}`
    : person
      ? (bulk ? `${person} (bulk action)` : person)
      : (system || !meta.actor_id ? 'System' : 'Unknown user')

  const changes = Object.entries(meta.changes || {}).map(([field, { from, to }]) => ({
    label: FIELD_LABELS[field] || humanize(field),
    from: formatValue(field, from),
    to: formatValue(field, to),
  }))

  let title
  switch (entry?.action) {
    case 'participant_created': title = 'Added to the list'; break
    case 'participant_tag_added': title = `Tag added: ${meta.tag_name || 'tag'}`; break
    case 'participant_tag_removed': title = `Tag removed: ${meta.tag_name || 'tag'}`; break
    case 'participant_updated': title = changes.length === 1 ? `${changes[0].label} changed` : `${changes.length} fields changed`; break
    case 'import_applied': title = 'Import applied'; break
    case 'import_no_change': title = 'Import checked, no changes'; break
    default: title = humanize(entry?.action || 'activity')
  }
  return { title, actor, automatic, bulk, reason: meta.reason || null, changes }
}
