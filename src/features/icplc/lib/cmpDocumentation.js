/**
 * ICPLC CMP Documentation Mapper
 *
 * Maps CMP form field IDs and answers to ICPLC canonical participant fields.
 * Explicit allowlists; no inference from raw values.
 */

// Exact discovered field IDs from cmuj6atvq01v5rhwzjsu4xzgj
export const CMP_FIELD_IDS = {
  email: 'email_hfrr',
  firstName: 'first_name_3t0m',
  lastName: 'last_name_4fjk',
  phone: 'phone_number_z74r',
  passportStatus: 'do_you_currently_have_a_valid_pa_tmoi',
  passportRegion: 'what_country_issued_your_passpor_r7rv',
  canadianStatus: 'what_is_your_current_status_in_c_65cl',
  canadianDocValidity: 'will_your_current_canadian_immig_wt9e',
  assistanceRequested: 'would_you_like_assistance_from_t_a8nq',
};

// Passport status: explicit allowlist mapping
export function mapPassportStatus(rawValue) {
  const map = {
    'I have a valid passport': 'ready',
    'I do not currently have a valid passport': 'no_passport',
    'My passport application or renewal is in progress': 'renewal_in_progress',
  };
  return map[rawValue] || null; // null = unknown/unrecognized
}

// Canadian residency status: explicit allowlist mapping
export function mapCanadianStatus(rawValue) {
  const map = {
    'Canadian Citizen': 'CANADIAN_CITIZEN',
    'Permanent Resident': 'PERMANENT_RESIDENT',
    'International Student / Study Permit Holder': 'INTERNATIONAL_STUDENT',
    'Post-Graduation Work Permit Holder': 'POST_GRADUATION_WORKER',
    'Visitor': 'VISITOR_OTHER',
  };
  return map[rawValue] || null; // null = unknown/unrecognized
}

// Canadian document validity ("remain valid through the end of November?")
export function mapCanadianDocValidity(rawValue) {
  const v = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : '';
  if (v === 'yes') return 'READY';
  if (v === 'no') return 'RENEWAL_NEEDED';
  return null; // null = unknown/unrecognized
}

/**
 * Status-document readiness to use for a participant: the stored value when staff/sync set one,
 * otherwise what the participant reported on the CMP form ("valid through November?" Yes/No),
 * so records synced before the mapping existed are still understood. Citizens need no document.
 */
export function effectiveCanadaDocReadiness(p) {
  const stored = p?.canada_status_document_readiness;
  if (stored && stored !== 'UNKNOWN') return stored;
  if (p?.canada_residency_status === 'CANADIAN_CITIZEN') return stored || null;
  return mapCanadianDocValidity(p?.source_values?.cmp_documentation?.canadian_doc_valid_through_nov) || stored || null;
}

// Passport region as reported by the participant (not the country)
export function mapPassportRegion(rawValue) {
  const v = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : '';
  if (v === 'ecowas') return 'ECOWAS';
  if (v === 'non-ecowas' || v === 'non ecowas' || v === 'non_ecowas') return 'NON_ECOWAS';
  return null; // null = unknown/unrecognized
}

// Normalize email for claim lookups
export function normalizeEmail(email) {
  if (!email) return null;
  return email.trim().toLowerCase() || null;
}

// Extract answers into a keyed object
export function extractAnswers(submission) {
  return submission.answers || {};
}

// Build source_values for CMP documentation namespace
export function buildSourceValues(submission, answers) {
  return {
    cmp_documentation: {
      submission_id: submission.id,
      submitter_name: submission.submitterName,
      created_at: submission.createdAt,
      observed_at: new Date().toISOString(),
      first_name: answers[CMP_FIELD_IDS.firstName],
      last_name: answers[CMP_FIELD_IDS.lastName],
      email: answers[CMP_FIELD_IDS.email],
      phone: answers[CMP_FIELD_IDS.phone],
      passport_status_raw: answers[CMP_FIELD_IDS.passportStatus],
      passport_region: answers[CMP_FIELD_IDS.passportRegion], // source-only
      canadian_status_raw: answers[CMP_FIELD_IDS.canadianStatus],
      canadian_doc_valid_through_nov: answers[CMP_FIELD_IDS.canadianDocValidity], // source-only
      assistance_requested: answers[CMP_FIELD_IDS.assistanceRequested], // source-only
    },
  };
}

export function mergeSourceValues(existingSourceValues = {}, incomingSourceValues = {}) {
  const existingCmp = existingSourceValues.cmp_documentation || {};
  const incomingCmp = incomingSourceValues.cmp_documentation || {};
  const definedIncomingCmp = Object.fromEntries(
    Object.entries(incomingCmp).filter(([, value]) => value !== undefined)
  );

  return {
    ...existingSourceValues,
    ...incomingSourceValues,
    cmp_documentation: {
      ...existingCmp,
      ...definedIncomingCmp,
    },
  };
}

// Determine canonical mutations based on override state
export function computeMutations(participant, answers, sourceValues) {
  const mutations = {
    source_values: sourceValues,
    canonical: {},
  };

  // Passport readiness
  const passportRaw = answers[CMP_FIELD_IDS.passportStatus];
  const passportCanonical = mapPassportStatus(passportRaw);

  if (passportCanonical) {
    // Only mutate if not overridden
    if (!(participant.override_fields?.passport_readiness?.overridden)) {
      mutations.canonical.passport_readiness = passportCanonical;
    }
  } else if (passportRaw) {
    // Unknown/unrecognized value
    mutations.unrecognized_passport_value = passportRaw;
  }

  // Canadian status
  const canadianRaw = answers[CMP_FIELD_IDS.canadianStatus];
  const canadianCanonical = mapCanadianStatus(canadianRaw);

  if (canadianCanonical) {
    // Only mutate if not overridden
    if (!(participant.override_fields?.canada_residency_status?.overridden)) {
      mutations.canonical.canada_residency_status = canadianCanonical;
    }
  } else if (canadianRaw) {
    // Unknown/unrecognized value
    mutations.unrecognized_canadian_value = canadianRaw;
  }

  // Passport region (kept separate from passport_country)
  const regionRaw = answers[CMP_FIELD_IDS.passportRegion];
  const regionCanonical = mapPassportRegion(regionRaw);

  if (regionCanonical) {
    if (!(participant.override_fields?.passport_region?.overridden)) {
      mutations.canonical.passport_region = regionCanonical;
    }
  } else if (regionRaw) {
    mutations.unrecognized_passport_region_value = regionRaw;
  }

  // Canadian document validity → readiness. Citizens need no status document, so leave them alone.
  const validityRaw = answers[CMP_FIELD_IDS.canadianDocValidity];
  const validityCanonical = mapCanadianDocValidity(validityRaw);
  const finalResidency = mutations.canonical.canada_residency_status ?? participant.canada_residency_status;

  if (validityCanonical) {
    if (finalResidency !== 'CANADIAN_CITIZEN'
      && !(participant.override_fields?.canada_status_document_readiness?.overridden)) {
      mutations.canonical.canada_status_document_readiness = validityCanonical;
    }
  } else if (validityRaw) {
    mutations.unrecognized_doc_validity_value = validityRaw;
  }

  return mutations;
}

/**
 * Classify a CMP submission result
 */
export const SubmissionStatus = {
  MATCHED_APPLIED: 'matched_applied',
  MATCHED_SOURCE_ONLY: 'matched_source_only',
  UNMATCHED: 'unmatched',
  IDENTITY_CONFLICT: 'identity_conflict',
  UNKNOWN_VALUE: 'unknown_value',
  ERROR: 'error',
};
