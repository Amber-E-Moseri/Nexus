/**
 * ICPLC Canadian Status Document Readiness — domain helper
 *
 * Pure functions and constants for deriving Canadian-status-document requirements
 * from a participant's residency status, and mapping document readiness onto the
 * ICPLC overall readiness vocabulary.
 *
 * THREE DISTINCT CONCEPTS — never collapse them:
 *   1. Canadian status document  (study permit, PGWP, work permit, PR card, …)
 *   2. Passport
 *   3. Destination-country visa / entry requirement
 *
 * This file covers (1) only. A study permit is NOT a visa.
 *
 * Nexus is tracking operational readiness, NOT making immigration-law determinations.
 * Language used: "study permit readiness", "document issue", "needs review".
 * Language avoided: "legally eligible", "approved by Nexus", "legally entitled to PGWP".
 */

// ── Canadian residency status values (stored in DB) ──────────────────────────

export const RESIDENCY_STATUS = {
  CANADIAN_CITIZEN:       'CANADIAN_CITIZEN',
  PERMANENT_RESIDENT:     'PERMANENT_RESIDENT',
  INTERNATIONAL_STUDENT:  'INTERNATIONAL_STUDENT',
  POST_GRADUATION_WORKER: 'POST_GRADUATION_WORKER',
  WORK_PERMIT:            'WORK_PERMIT',
  VISITOR_OTHER:          'VISITOR_OTHER',
};

export const RESIDENCY_STATUS_LABELS = {
  CANADIAN_CITIZEN:       'Canadian Citizen',
  PERMANENT_RESIDENT:     'Permanent Resident',
  INTERNATIONAL_STUDENT:  'International Student',
  POST_GRADUATION_WORKER: 'Post-Graduation Worker (PGWP)',
  WORK_PERMIT:            'Work Permit Holder',
  VISITOR_OTHER:          'Visitor / Other',
};

// ── Document type vocabulary (derived, never stored) ─────────────────────────

export const DOCUMENT_TYPE = {
  NONE:         'NONE',         // Canadian citizen — no status document required
  STUDY_PERMIT: 'STUDY_PERMIT',
  PGWP:         'PGWP',         // Post-graduation work permit
  WORK_PERMIT:  'WORK_PERMIT',
  PR_CARD:      'PR_CARD',
  REVIEW:       'REVIEW',       // Visitor/Other or unknown — needs manual review
};

export const DOCUMENT_TYPE_LABELS = {
  NONE:         'None',
  STUDY_PERMIT: 'Study Permit',
  PGWP:         'PGWP / Work Permit',
  WORK_PERMIT:  'Work Permit',
  PR_CARD:      'PR Card',
  REVIEW:       'Needs Review',
};

// Short label used in group headings on the Documentation page
export const DOCUMENT_TYPE_GROUP_LABELS = {
  NONE:         'Canadian Citizens',
  STUDY_PERMIT: 'Study Permits',
  PGWP:         'PGWP / Work Permits',
  WORK_PERMIT:  'Work Permits',
  PR_CARD:      'PR Cards',
  REVIEW:       'Needs Review',
};

// ── Document readiness states (stored in DB) ─────────────────────────────────

export const DOCUMENT_READINESS = {
  UNKNOWN:             'UNKNOWN',
  READY:               'READY',
  RENEWAL_NEEDED:      'RENEWAL_NEEDED',
  RENEWAL_IN_PROGRESS: 'RENEWAL_IN_PROGRESS',
  ISSUE:               'ISSUE',
  NOT_APPLICABLE:      'NOT_APPLICABLE',
};

export const DOCUMENT_READINESS_LABELS = {
  UNKNOWN:             'Unknown',
  READY:               'Ready',
  RENEWAL_NEEDED:      'Renewal needed',
  RENEWAL_IN_PROGRESS: 'Renewal in progress',
  ISSUE:               'Document issue',
  NOT_APPLICABLE:      'Not applicable',
};

// ── Field source authority ────────────────────────────────────────────────────
//
// Tracks how a Canadian status field was last written.
// NEXUS_MANUAL acts as the lock signal: participant form cannot overwrite.
// PARTICIPANT_FORM or null means the field follows participant submissions.

export const FIELD_SOURCE = {
  PARTICIPANT_FORM: 'PARTICIPANT_FORM',
  NEXUS_MANUAL:     'NEXUS_MANUAL',
  CSV_IMPORT:       'CSV_IMPORT',
};

export const FIELD_SOURCE_LABELS = {
  PARTICIPANT_FORM: 'Updated through participant form',
  NEXUS_MANUAL:     'Updated manually in Nexus',
  CSV_IMPORT:       'Updated via import',
};

// ── Overall readiness vocabulary (not persisted — derived in JS) ──────────────
// Precedence (highest → lowest severity): BLOCKED > ACTION_REQUIRED > IN_PROGRESS > READY > UNKNOWN

export const OVERALL_READINESS = {
  UNKNOWN:         'UNKNOWN',
  IN_PROGRESS:     'IN_PROGRESS',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  READY:           'READY',
  BLOCKED:         'BLOCKED',
};

// ── Status → required document mapping ───────────────────────────────────────
//
// This mapping represents the OPERATIONAL document category we need to check
// for this participant, NOT a legal determination that they hold or are eligible
// for any particular document.
//
// V1 mapping (isolate here so it can be updated without scattering conditions):

const STATUS_TO_DOCUMENT_TYPE = {
  CANADIAN_CITIZEN:       DOCUMENT_TYPE.NONE,
  PERMANENT_RESIDENT:     DOCUMENT_TYPE.PR_CARD,
  INTERNATIONAL_STUDENT:  DOCUMENT_TYPE.STUDY_PERMIT,
  POST_GRADUATION_WORKER: DOCUMENT_TYPE.PGWP,
  WORK_PERMIT:            DOCUMENT_TYPE.WORK_PERMIT,
  VISITOR_OTHER:          DOCUMENT_TYPE.REVIEW,
};

/**
 * Derive the required Canadian status document type from a residency status value.
 * Returns REVIEW for null/unknown/unrecognised statuses.
 */
export function deriveDocumentType(residencyStatus) {
  return STATUS_TO_DOCUMENT_TYPE[residencyStatus] ?? DOCUMENT_TYPE.REVIEW;
}

// ── Readiness contribution ────────────────────────────────────────────────────

/**
 * Maps a participant's Canadian status document readiness onto the ICPLC overall
 * readiness vocabulary. This value is one input into the full readiness derivation;
 * it does not replace other dimensions (passport, destination visa, travel, etc.).
 *
 * Severity precedence: BLOCKED > ACTION_REQUIRED > IN_PROGRESS > READY > UNKNOWN
 * (CRITICAL is not in scope — do not add it.)
 */
export function computeDocReadinessContribution(residencyStatus, documentReadiness) {
  const docType = deriveDocumentType(residencyStatus);

  // Canadian citizen: no Canadian-status document required
  if (docType === DOCUMENT_TYPE.NONE) return OVERALL_READINESS.READY;

  // No residency status on file — status information required
  if (!residencyStatus) return OVERALL_READINESS.UNKNOWN;

  // Visitor/Other or unknown status → operational review required
  if (docType === DOCUMENT_TYPE.REVIEW) return OVERALL_READINESS.ACTION_REQUIRED;

  // Residency status is known; evaluate document readiness
  switch (documentReadiness) {
    case DOCUMENT_READINESS.READY:               return OVERALL_READINESS.READY;
    case DOCUMENT_READINESS.NOT_APPLICABLE:      return OVERALL_READINESS.READY;
    case DOCUMENT_READINESS.RENEWAL_IN_PROGRESS: return OVERALL_READINESS.IN_PROGRESS;
    case DOCUMENT_READINESS.RENEWAL_NEEDED:      return OVERALL_READINESS.ACTION_REQUIRED;
    case DOCUMENT_READINESS.ISSUE:               return OVERALL_READINESS.ACTION_REQUIRED;
    case DOCUMENT_READINESS.UNKNOWN:
    default:                                     return OVERALL_READINESS.UNKNOWN;
  }
}

// ── Needs-attention conditions ────────────────────────────────────────────────

/**
 * Returns a short attention reason string if this participant needs action on their
 * Canadian status document, or null if no attention is needed.
 *
 * Conditions that surface in Needs Attention:
 *   - Status unknown (null)
 *   - Visitor/Other requiring review
 *   - Document issue
 *   - Renewal needed
 *   - Document readiness unknown (status known but readiness not yet entered)
 *
 * Conditions that do NOT surface here (not urgent):
 *   - RENEWAL_IN_PROGRESS (being handled)
 *   - READY / NOT_APPLICABLE / Canadian citizen
 */
export function docNeedsAttention(r) {
  const status = r.canadaResidencyStatus;
  const docType = deriveDocumentType(status);

  // Canadian citizen: nothing to track
  if (docType === DOCUMENT_TYPE.NONE) return null;

  // No status on file
  if (!status) return 'Canadian status unknown';

  // Visitor/Other: manual review required
  if (docType === DOCUMENT_TYPE.REVIEW) return 'Canadian status needs review';

  const readiness = r.canadaStatusDocumentReadiness;
  const typeLabel = DOCUMENT_TYPE_LABELS[docType] || 'Canadian status document';

  switch (readiness) {
    case DOCUMENT_READINESS.ISSUE:          return `${typeLabel} issue`;
    case DOCUMENT_READINESS.RENEWAL_NEEDED: return `${typeLabel} renewal needed`;
    case DOCUMENT_READINESS.READY:
    case DOCUMENT_READINESS.NOT_APPLICABLE:
    case DOCUMENT_READINESS.RENEWAL_IN_PROGRESS:
      return null;
    case DOCUMENT_READINESS.UNKNOWN:
    default:
      return `${typeLabel} readiness unknown`;
  }
}
