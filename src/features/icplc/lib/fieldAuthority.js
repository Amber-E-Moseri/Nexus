// Field-level override protection for ICPLC participants.
// An overridden field is a staff correction that survives re-imports.
// "Resume source sync" clears the override so the field becomes importable again.

import { MUTABLE_FIELDS_BY_SOURCE } from './csvMappings.js'

/**
 * Returns true if the given field is currently overridden by staff.
 * @param {object} participant - icplc_participants row
 * @param {string} field
 */
export function isFieldOverridden(participant, field) {
  return participant.override_fields?.[field]?.overridden === true
}

/**
 * Returns the override metadata for a field, or null if not overridden.
 * @param {object} participant
 * @param {string} field
 * @returns {{ overridden: true, by: string, at: string } | null}
 */
export function getOverrideMeta(participant, field) {
  const meta = participant.override_fields?.[field]
  return meta?.overridden === true ? meta : null
}

/**
 * Returns true if the source is allowed to update the given field,
 * regardless of override status (mutable field check only).
 */
export function isMutableBySource(field, source) {
  return MUTABLE_FIELDS_BY_SOURCE[source]?.has(field) ?? false
}

/**
 * Server-side authority decision: should the import update this field?
 * Returns one of:
 *   'update'              — field will be updated to the incoming value
 *   'no_change'           — incoming value equals current value
 *   'protected'           — staff override prevents update
 *   'skipped_not_mutable' — field is not importable from this source
 *
 * NOTE: This function mirrors the server-side logic in the Edge Function.
 * The browser calls it only to compute local previews during step transitions.
 * The server-computed changes_preview in icplc_import_rows is the authority.
 */
export function shouldUpdate(participant, field, incomingValue, source) {
  if (!isMutableBySource(field, source)) return 'skipped_not_mutable'
  if (isFieldOverridden(participant, field)) return 'protected'
  const currentValue = participant[field]
  if (currentValue === incomingValue) return 'no_change'
  return 'update'
}

/**
 * Returns the JSONB patch to clear an override on a field.
 * Pass the result as a jsonb_strip_nulls(override_fields || patch) update.
 */
export function clearOverridePatch(field) {
  return { [field]: null }
}

/**
 * Returns the JSONB patch to set an override on a field.
 */
export function setOverridePatch(field, userId) {
  return {
    [field]: {
      overridden: true,
      by: userId,
      at: new Date().toISOString(),
    },
  }
}

// Staff-managed Canadian documentation fields — never written by any import source,
// but recorded as overrides so the UI can show "staff override active".
const STAFF_OVERRIDE_FIELDS = new Set([
  'canada_residency_status', 'canada_status_document_readiness',
  // CMP documentation sync writes these, so a staff correction must stick.
  'passport_region', 'documentation_assistance_requested',
])

/**
 * Of the fields a staff member just edited, which must be recorded as overrides?
 * Any field an import source may write (so re-imports cannot clobber the edit)
 * plus the staff-managed Canadian fields.
 */
export function overrideFieldsForEdit(changedFields) {
  return changedFields.filter((field) =>
    STAFF_OVERRIDE_FIELDS.has(field) ||
    Object.values(MUTABLE_FIELDS_BY_SOURCE).some((set) => set.has(field)))
}
