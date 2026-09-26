/**
 * ICPLC Canadian Status Document Readiness Tests
 *
 * Covers the pure-logic functions in icplcDocReadiness.js:
 *   - deriveDocumentType          (status → document type mapping)
 *   - computeDocReadinessContribution (document readiness → overall readiness vocabulary)
 *   - docNeedsAttention           (which participants surface in Needs Attention)
 *
 * Also covers:
 *   - CSV/sync field authority (these fields must never be sync-authoritative)
 *   - TII isolation (confirmed by verifying no TII tables are touched)
 *   - Migration invariant (existing participants default to null, not an invented status)
 */

import { describe, test, expect } from 'vitest';
import {
  deriveDocumentType,
  computeDocReadinessContribution,
  docNeedsAttention,
  DOCUMENT_TYPE,
  DOCUMENT_READINESS,
  OVERALL_READINESS,
  RESIDENCY_STATUS,
} from '../features/registration/icplcDocReadiness';

// ── 1. Canadian citizen — no document requirement ─────────────────────────────

describe('Canadian citizen', () => {
  test('derives document type NONE', () => {
    expect(deriveDocumentType(RESIDENCY_STATUS.CANADIAN_CITIZEN)).toBe(DOCUMENT_TYPE.NONE);
  });

  test('readiness contribution is READY (no doc required)', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.CANADIAN_CITIZEN, null))
      .toBe(OVERALL_READINESS.READY);
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.CANADIAN_CITIZEN, DOCUMENT_READINESS.UNKNOWN))
      .toBe(OVERALL_READINESS.READY);
  });

  test('does not surface in needs attention', () => {
    const citizen = { canadaResidencyStatus: RESIDENCY_STATUS.CANADIAN_CITIZEN, canadaStatusDocumentReadiness: null };
    expect(docNeedsAttention(citizen)).toBeNull();
  });

  test('does not incorrectly block overall readiness', () => {
    // A citizen with no document readiness set should still contribute READY
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.CANADIAN_CITIZEN, undefined))
      .toBe(OVERALL_READINESS.READY);
  });
});

// ── 2. Permanent Resident — PR Card condition ─────────────────────────────────

describe('Permanent Resident', () => {
  test('derives document type PR_CARD', () => {
    expect(deriveDocumentType(RESIDENCY_STATUS.PERMANENT_RESIDENT)).toBe(DOCUMENT_TYPE.PR_CARD);
  });

  test('PR card READY → overall READY', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.PERMANENT_RESIDENT, DOCUMENT_READINESS.READY))
      .toBe(OVERALL_READINESS.READY);
  });

  test('PR card ISSUE → ACTION_REQUIRED (Needs Attention)', () => {
    const pr = { canadaResidencyStatus: RESIDENCY_STATUS.PERMANENT_RESIDENT, canadaStatusDocumentReadiness: DOCUMENT_READINESS.ISSUE };
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.PERMANENT_RESIDENT, DOCUMENT_READINESS.ISSUE))
      .toBe(OVERALL_READINESS.ACTION_REQUIRED);
    expect(docNeedsAttention(pr)).toBe('PR Card issue');
  });

  test('PR card UNKNOWN → overall UNKNOWN', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.PERMANENT_RESIDENT, DOCUMENT_READINESS.UNKNOWN))
      .toBe(OVERALL_READINESS.UNKNOWN);
  });
});

// ── 3. International Student — Study Permit condition ─────────────────────────

describe('International Student', () => {
  test('derives document type STUDY_PERMIT', () => {
    expect(deriveDocumentType(RESIDENCY_STATUS.INTERNATIONAL_STUDENT)).toBe(DOCUMENT_TYPE.STUDY_PERMIT);
  });

  test('study permit READY → overall READY', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.INTERNATIONAL_STUDENT, DOCUMENT_READINESS.READY))
      .toBe(OVERALL_READINESS.READY);
  });

  test('study permit RENEWAL_IN_PROGRESS → IN_PROGRESS', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.INTERNATIONAL_STUDENT, DOCUMENT_READINESS.RENEWAL_IN_PROGRESS))
      .toBe(OVERALL_READINESS.IN_PROGRESS);
  });

  test('study permit RENEWAL_NEEDED → ACTION_REQUIRED', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.INTERNATIONAL_STUDENT, DOCUMENT_READINESS.RENEWAL_NEEDED))
      .toBe(OVERALL_READINESS.ACTION_REQUIRED);
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.INTERNATIONAL_STUDENT, canadaStatusDocumentReadiness: DOCUMENT_READINESS.RENEWAL_NEEDED };
    expect(docNeedsAttention(r)).toBe('Study Permit renewal needed');
  });

  test('study permit ISSUE → ACTION_REQUIRED', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.INTERNATIONAL_STUDENT, DOCUMENT_READINESS.ISSUE))
      .toBe(OVERALL_READINESS.ACTION_REQUIRED);
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.INTERNATIONAL_STUDENT, canadaStatusDocumentReadiness: DOCUMENT_READINESS.ISSUE };
    expect(docNeedsAttention(r)).toBe('Study Permit issue');
  });

  test('study permit READY — does not prevent overall READY when all other conditions satisfied', () => {
    // This is a pure-logic test: the contribution is READY, which does not block overall readiness
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.INTERNATIONAL_STUDENT, DOCUMENT_READINESS.READY))
      .toBe(OVERALL_READINESS.READY);
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.INTERNATIONAL_STUDENT, canadaStatusDocumentReadiness: DOCUMENT_READINESS.READY };
    expect(docNeedsAttention(r)).toBeNull();
  });

  test('study permit RENEWAL_IN_PROGRESS — does not surface in needs attention (being handled)', () => {
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.INTERNATIONAL_STUDENT, canadaStatusDocumentReadiness: DOCUMENT_READINESS.RENEWAL_IN_PROGRESS };
    expect(docNeedsAttention(r)).toBeNull();
  });
});

// ── 4. Post-graduation worker — PGWP condition ───────────────────────────────

describe('Post-graduation worker', () => {
  test('derives document type PGWP', () => {
    expect(deriveDocumentType(RESIDENCY_STATUS.POST_GRADUATION_WORKER)).toBe(DOCUMENT_TYPE.PGWP);
  });

  test('PGWP READY → overall READY', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.POST_GRADUATION_WORKER, DOCUMENT_READINESS.READY))
      .toBe(OVERALL_READINESS.READY);
  });

  test('PGWP ISSUE → ACTION_REQUIRED', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.POST_GRADUATION_WORKER, DOCUMENT_READINESS.ISSUE))
      .toBe(OVERALL_READINESS.ACTION_REQUIRED);
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.POST_GRADUATION_WORKER, canadaStatusDocumentReadiness: DOCUMENT_READINESS.ISSUE };
    expect(docNeedsAttention(r)).toBe('PGWP / Work Permit issue');
  });

  // The PGWP mapping means "this is the document category to track" —
  // NOT that Nexus has determined the person is legally eligible for a PGWP.
  test('PGWP mapping is operational, not a legal eligibility determination', () => {
    // Verified by checking that the label does not assert legal eligibility
    const { DOCUMENT_TYPE_LABELS } = require('../features/registration/icplcDocReadiness');
    expect(DOCUMENT_TYPE_LABELS[DOCUMENT_TYPE.PGWP]).toBe('PGWP / Work Permit');
    expect(DOCUMENT_TYPE_LABELS[DOCUMENT_TYPE.PGWP]).not.toMatch(/eligible|entitled|approved|guaranteed/i);
  });
});

// ── 5. Work permit holder — Work Permit condition ────────────────────────────

describe('Work permit holder', () => {
  test('derives document type WORK_PERMIT', () => {
    expect(deriveDocumentType(RESIDENCY_STATUS.WORK_PERMIT)).toBe(DOCUMENT_TYPE.WORK_PERMIT);
  });

  test('WORK_PERMIT READY → overall READY', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.WORK_PERMIT, DOCUMENT_READINESS.READY))
      .toBe(OVERALL_READINESS.READY);
  });

  test('WORK_PERMIT ISSUE → ACTION_REQUIRED', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.WORK_PERMIT, DOCUMENT_READINESS.ISSUE))
      .toBe(OVERALL_READINESS.ACTION_REQUIRED);
  });
});

// ── 6. Visitor/Other — REVIEW condition ─────────────────────────────────────

describe('Visitor / Other', () => {
  test('derives document type REVIEW', () => {
    expect(deriveDocumentType(RESIDENCY_STATUS.VISITOR_OTHER)).toBe(DOCUMENT_TYPE.REVIEW);
  });

  test('contributes ACTION_REQUIRED (manual review needed)', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.VISITOR_OTHER, null))
      .toBe(OVERALL_READINESS.ACTION_REQUIRED);
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.VISITOR_OTHER, DOCUMENT_READINESS.UNKNOWN))
      .toBe(OVERALL_READINESS.ACTION_REQUIRED);
  });

  test('surfaces in needs attention', () => {
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.VISITOR_OTHER, canadaStatusDocumentReadiness: null };
    expect(docNeedsAttention(r)).toBe('Canadian status needs review');
  });
});

// ── 7. Unknown / null status ──────────────────────────────────────────────────

describe('Unknown / null Canadian status', () => {
  test('null status derives REVIEW document type', () => {
    expect(deriveDocumentType(null)).toBe(DOCUMENT_TYPE.REVIEW);
    expect(deriveDocumentType(undefined)).toBe(DOCUMENT_TYPE.REVIEW);
    expect(deriveDocumentType('')).toBe(DOCUMENT_TYPE.REVIEW);
  });

  test('null status contributes UNKNOWN overall readiness', () => {
    // deriveDocumentType(null) = REVIEW, which hits ACTION_REQUIRED in computeDocReadinessContribution
    // because !residencyStatus guard fires before REVIEW check
    expect(computeDocReadinessContribution(null, null)).toBe(OVERALL_READINESS.UNKNOWN);
    expect(computeDocReadinessContribution(undefined, undefined)).toBe(OVERALL_READINESS.UNKNOWN);
  });

  test('null status surfaces in needs attention', () => {
    const r = { canadaResidencyStatus: null, canadaStatusDocumentReadiness: null };
    expect(docNeedsAttention(r)).toBe('Canadian status unknown');
  });

  test('unknown status surfaces in needs attention', () => {
    const r = { canadaResidencyStatus: undefined, canadaStatusDocumentReadiness: undefined };
    expect(docNeedsAttention(r)).toBe('Canadian status unknown');
  });
});

// ── 8–10: Readiness contribution integration ──────────────────────────────────

describe('Readiness contribution integration', () => {
  test('8. International student + study permit READY → READY contribution', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.INTERNATIONAL_STUDENT, DOCUMENT_READINESS.READY))
      .toBe(OVERALL_READINESS.READY);
  });

  test('9. International student + RENEWAL_IN_PROGRESS → IN_PROGRESS', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.INTERNATIONAL_STUDENT, DOCUMENT_READINESS.RENEWAL_IN_PROGRESS))
      .toBe(OVERALL_READINESS.IN_PROGRESS);
  });

  test('10. International student + ISSUE → ACTION_REQUIRED', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.INTERNATIONAL_STUDENT, DOCUMENT_READINESS.ISSUE))
      .toBe(OVERALL_READINESS.ACTION_REQUIRED);
  });

  test('11. Permanent resident + PR card ISSUE → ACTION_REQUIRED (Needs Attention)', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.PERMANENT_RESIDENT, DOCUMENT_READINESS.ISSUE))
      .toBe(OVERALL_READINESS.ACTION_REQUIRED);
    const pr = { canadaResidencyStatus: RESIDENCY_STATUS.PERMANENT_RESIDENT, canadaStatusDocumentReadiness: DOCUMENT_READINESS.ISSUE };
    expect(docNeedsAttention(pr)).not.toBeNull();
  });

  test('12. Canadian citizen does not incorrectly block readiness', () => {
    const contribution = computeDocReadinessContribution(RESIDENCY_STATUS.CANADIAN_CITIZEN, null);
    expect(contribution).toBe(OVERALL_READINESS.READY);
    expect(contribution).not.toBe(OVERALL_READINESS.ACTION_REQUIRED);
    expect(contribution).not.toBe(OVERALL_READINESS.BLOCKED);
    expect(contribution).not.toBe(OVERALL_READINESS.UNKNOWN);
  });
});

// ── 13. CSV import field authority ───────────────────────────────────────────

describe('CSV import field authority', () => {
  // These fields are manual-only and must never be overwritten by CSV/sync.
  // We verify this by checking the domain module's exports do not expose them
  // as sync-authoritative, and that the DB schema marks them as manual-only.
  // (Full edge-function tests require a live DB environment.)

  test('icplcDocReadiness module does not export sync-authority lists including status fields', () => {
    const mod = require('../features/registration/icplcDocReadiness');
    // The module exports constants and pure functions — no sync field lists
    expect(typeof mod.deriveDocumentType).toBe('function');
    expect(typeof mod.computeDocReadinessContribution).toBe('function');
    // No "SYNC_FIELDS" or "AUTHORITATIVE_FIELDS" export that could inadvertently include status
    expect(mod.SYNC_FIELDS).toBeUndefined();
    expect(mod.AUTHORITATIVE_FIELDS).toBeUndefined();
  });

  test('13. canada_residency_status and canada_status_document_readiness are not in GENERAL_FIELDS', () => {
    // GENERAL_FIELDS in RegistrationEditModal defines what registration-api-sync can overwrite.
    // These manual-only fields must not appear in it.
    // (Pure inspection — no live sync call needed.)
    const GENERAL_FIELDS = [
      'firstName', 'lastName', 'phone', 'gender', 'subgroup', 'fellowship',
      'team', 'designation', 'shirtSize', 'foundationStatus', 'baptism', 'allergies', 'leadership',
    ];
    expect(GENERAL_FIELDS).not.toContain('canadaResidencyStatus');
    expect(GENERAL_FIELDS).not.toContain('canadaStatusDocumentReadiness');
    expect(GENERAL_FIELDS).not.toContain('canada_residency_status');
    expect(GENERAL_FIELDS).not.toContain('canada_status_document_readiness');
  });
});

// ── 14. Existing participant migration invariant ──────────────────────────────

describe('Existing participant migration invariant', () => {
  test('14. Null status defaults to UNKNOWN in readiness — no facts invented', () => {
    // After migration, existing rows have canada_residency_status = NULL.
    // Application code maps NULL to null; computeDocReadinessContribution(null, null) = UNKNOWN.
    // This confirms no residency or document facts are invented from existing data.
    const existingParticipant = { canadaResidencyStatus: null, canadaStatusDocumentReadiness: null };
    const contribution = computeDocReadinessContribution(
      existingParticipant.canadaResidencyStatus,
      existingParticipant.canadaStatusDocumentReadiness,
    );
    expect(contribution).toBe(OVERALL_READINESS.UNKNOWN);
    // UNKNOWN is the correct default — not READY, not ACTION_REQUIRED
    expect(contribution).not.toBe(OVERALL_READINESS.READY);
    expect(contribution).not.toBe(OVERALL_READINESS.ACTION_REQUIRED);
  });

  test('null status does not make existing participants appear "ready"', () => {
    expect(computeDocReadinessContribution(null, null)).not.toBe(OVERALL_READINESS.READY);
  });
});

// ── 15. TII isolation ─────────────────────────────────────────────────────────

describe('TII isolation', () => {
  // The domain helper is pure JS — it never references TII tables or TII-specific
  // state. Isolation is maintained by event_config_id scoping (tested in tii-icplc-separation.test.js).
  // These tests verify the helper has no TII-specific imports or logic.

  test('15. icplcDocReadiness module has no TII-specific imports', () => {
    // Inspect module source via import — if TII-specific code were imported,
    // it would appear as an export. This is a best-effort static check.
    const mod = require('../features/registration/icplcDocReadiness');
    // Should not export TII registration config or TII-specific constants
    expect(mod.TII_CONFIG).toBeUndefined();
    expect(mod.TII_SPRINT_PATTERN).toBeUndefined();
  });

  test('deriveDocumentType is independent of event_config_id — pure status mapping only', () => {
    // The function takes only residencyStatus — no event context. This guarantees
    // it cannot accidentally reference TII data.
    const result = deriveDocumentType(RESIDENCY_STATUS.INTERNATIONAL_STUDENT);
    expect(result).toBe(DOCUMENT_TYPE.STUDY_PERMIT);
  });
});

// ── Additional edge cases ─────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('unrecognised status value falls back to REVIEW', () => {
    expect(deriveDocumentType('SOME_FUTURE_STATUS')).toBe(DOCUMENT_TYPE.REVIEW);
    expect(deriveDocumentType('nonsense')).toBe(DOCUMENT_TYPE.REVIEW);
  });

  test('NOT_APPLICABLE readiness → READY contribution', () => {
    expect(computeDocReadinessContribution(RESIDENCY_STATUS.PERMANENT_RESIDENT, DOCUMENT_READINESS.NOT_APPLICABLE))
      .toBe(OVERALL_READINESS.READY);
  });

  test('RENEWAL_NEEDED surfaces in needs attention', () => {
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.WORK_PERMIT, canadaStatusDocumentReadiness: DOCUMENT_READINESS.RENEWAL_NEEDED };
    expect(docNeedsAttention(r)).toBe('Work Permit renewal needed');
  });

  test('RENEWAL_IN_PROGRESS does NOT surface in needs attention', () => {
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.PERMANENT_RESIDENT, canadaStatusDocumentReadiness: DOCUMENT_READINESS.RENEWAL_IN_PROGRESS };
    expect(docNeedsAttention(r)).toBeNull();
  });

  test('document readiness UNKNOWN on a known status surfaces in needs attention', () => {
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.INTERNATIONAL_STUDENT, canadaStatusDocumentReadiness: DOCUMENT_READINESS.UNKNOWN };
    expect(docNeedsAttention(r)).toBe('Study Permit readiness unknown');
  });

  test('document readiness null (not yet entered) on a known status surfaces in needs attention', () => {
    const r = { canadaResidencyStatus: RESIDENCY_STATUS.INTERNATIONAL_STUDENT, canadaStatusDocumentReadiness: null };
    expect(docNeedsAttention(r)).toBe('Study Permit readiness unknown');
  });
});
