/**
 * TII / ICPLC Separation Tests
 *
 * These tests verify the architectural invariant that This Is It 2.0 (TII) and
 * ICPLC are isolated systems that cannot contaminate each other's data.
 *
 * Key invariants:
 *   1. A NULL event_config_id record is a TII 2.0 historical record.
 *   2. An ICPLC event_config_id record belongs exclusively to ICPLC.
 *   3. buildRegistrationQuery with no eventId scopes to NULL (TII 2.0).
 *   4. buildRegistrationQuery with an eventId scopes to that event only.
 *   5. buildInsertRow always stamps event_config_id (never omits it).
 *   6. A TII record cannot accidentally become an ICPLC record.
 *   7. An ICPLC record cannot appear in TII historical reporting.
 */

import { describe, test, expect } from 'vitest';

// ── Pure logic extracted from RegistrationEcosystem ──────────────────────────

/**
 * Mirrors the event_config_id filter applied to every Supabase query
 * in RegistrationEcosystem's data-fetch useEffect.
 *
 * Returns the effective filter predicate that would be applied to a query
 * given the eventConfig in context.
 *
 *   { type: 'is_null' }         → filter by event_config_id IS NULL   (TII 2.0)
 *   { type: 'eq', id: uuid }    → filter by event_config_id = uuid    (non-TII event)
 */
function resolveEventFilter(eventConfig) {
  const eventId = eventConfig?.id ?? null;
  if (eventId) {
    return { type: 'eq', id: eventId };
  }
  return { type: 'is_null' };
}

/**
 * Mirrors the event_config_id stamping logic in handleMarkConfirming and
 * handleAddToWorkingList. Returns the value that would be written to DB.
 *
 *   null   → This Is It 2.0 historical record (legacy context has no id)
 *   uuid   → ICPLC or future event record
 */
function resolveInsertEventConfigId(eventConfig) {
  return eventConfig?.id ?? null;
}

/**
 * Simulates applying the event filter to a list of records, the way the DB
 * query would filter them.
 */
function applyEventFilter(records, filter) {
  if (filter.type === 'is_null') {
    return records.filter(r => r.event_config_id === null || r.event_config_id === undefined);
  }
  return records.filter(r => r.event_config_id === filter.id);
}

// ── Test data ─────────────────────────────────────────────────────────────────

const TII_CONFIG = {
  // Legacy TII context loaded from event_configs WHERE is_active = true.
  // The id field IS present in prod — but the null-check path handles
  // configs that were created before event_configs existed.
  id: '00000000-0000-0000-0000-000000000001',
  event_name: 'This Is It 2.0',
  sprint_pattern: '%This Is It 2.0%',
  is_active: true,
};

const ICPLC_CONFIG = {
  id: '00000000-0000-0000-0000-000000000002',
  event_name: 'ICPLC',
  sprint_pattern: '%ICPLC%',
  is_active: false,
};

// Represents records as they exist before the separation migration was run
// (event_config_id = null → TII 2.0 historical).
const HISTORICAL_REGISTRATIONS = [
  { id: 'r1', email: 'alice@example.com', event_config_id: null },
  { id: 'r2', email: 'bob@example.com',   event_config_id: null },
];

// Represents records written AFTER the separation — TII explicitly tagged.
const TII_TAGGED_REGISTRATIONS = [
  { id: 'r3', email: 'carol@example.com', event_config_id: TII_CONFIG.id },
];

// Represents ICPLC records.
const ICPLC_REGISTRATIONS = [
  { id: 'r4', email: 'dave@example.com',  event_config_id: ICPLC_CONFIG.id },
];

const ALL_REGISTRATIONS = [
  ...HISTORICAL_REGISTRATIONS,
  ...TII_TAGGED_REGISTRATIONS,
  ...ICPLC_REGISTRATIONS,
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TII / ICPLC event filter resolution', () => {
  test('null eventConfig.id resolves to IS NULL filter (TII 2.0 context)', () => {
    const filter = resolveEventFilter(null);
    expect(filter.type).toBe('is_null');
  });

  test('legacy TII config with no id resolves to IS NULL filter', () => {
    const legacyConfig = { event_name: 'This Is It 2.0', sprint_pattern: '%This Is It 2.0%' };
    const filter = resolveEventFilter(legacyConfig);
    expect(filter.type).toBe('is_null');
  });

  test('ICPLC config resolves to eq filter with its own id', () => {
    const filter = resolveEventFilter(ICPLC_CONFIG);
    expect(filter.type).toBe('eq');
    expect(filter.id).toBe(ICPLC_CONFIG.id);
  });

  test('TII config with id resolves to eq filter with TII id', () => {
    const filter = resolveEventFilter(TII_CONFIG);
    expect(filter.type).toBe('eq');
    expect(filter.id).toBe(TII_CONFIG.id);
  });
});

describe('TII 2.0 historical data access', () => {
  test('NULL filter returns only historical (null event_config_id) records', () => {
    const filter = resolveEventFilter(null);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    expect(result.length).toBe(HISTORICAL_REGISTRATIONS.length);
    expect(result.every(r => r.event_config_id === null)).toBe(true);
  });

  test('NULL filter does NOT return ICPLC records', () => {
    const filter = resolveEventFilter(null);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    const icplcLeaks = result.filter(r => r.event_config_id === ICPLC_CONFIG.id);
    expect(icplcLeaks.length).toBe(0);
  });

  test('NULL filter does NOT return TII-tagged (post-separation) records', () => {
    const filter = resolveEventFilter(null);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    // Post-separation TII records have an explicit id and should NOT appear in
    // the historical null-scoped view (they appear in the eq-scoped TII view).
    const tagged = result.filter(r => r.event_config_id === TII_CONFIG.id);
    expect(tagged.length).toBe(0);
  });
});

describe('ICPLC data isolation', () => {
  test('ICPLC filter returns only ICPLC records', () => {
    const filter = resolveEventFilter(ICPLC_CONFIG);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    expect(result.length).toBe(ICPLC_REGISTRATIONS.length);
    expect(result.every(r => r.event_config_id === ICPLC_CONFIG.id)).toBe(true);
  });

  test('ICPLC filter does NOT return historical TII records', () => {
    const filter = resolveEventFilter(ICPLC_CONFIG);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    const tiiLeaks = result.filter(r => r.event_config_id === null);
    expect(tiiLeaks.length).toBe(0);
  });

  test('ICPLC filter does NOT return TII-tagged records', () => {
    const filter = resolveEventFilter(ICPLC_CONFIG);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    const tiiLeaks = result.filter(r => r.event_config_id === TII_CONFIG.id);
    expect(tiiLeaks.length).toBe(0);
  });
});

describe('Insert provenance stamping', () => {
  test('null eventConfig stamps null event_config_id (historical TII path)', () => {
    expect(resolveInsertEventConfigId(null)).toBe(null);
  });

  test('legacy TII config without id stamps null (backward compatible)', () => {
    const legacyConfig = { event_name: 'This Is It 2.0', sprint_pattern: '%This Is It 2.0%' };
    expect(resolveInsertEventConfigId(legacyConfig)).toBe(null);
  });

  test('ICPLC config stamps its own id', () => {
    expect(resolveInsertEventConfigId(ICPLC_CONFIG)).toBe(ICPLC_CONFIG.id);
  });

  test('TII config with id stamps its own id (post-separation TII insert)', () => {
    expect(resolveInsertEventConfigId(TII_CONFIG)).toBe(TII_CONFIG.id);
  });

  test('TII insert cannot accidentally write ICPLC id', () => {
    // If context is TII, the insert id must never be ICPLC's id.
    const tiiInsertId = resolveInsertEventConfigId(TII_CONFIG);
    expect(tiiInsertId).not.toBe(ICPLC_CONFIG.id);
  });

  test('ICPLC insert cannot accidentally write TII id', () => {
    const icplcInsertId = resolveInsertEventConfigId(ICPLC_CONFIG);
    expect(icplcInsertId).not.toBe(TII_CONFIG.id);
  });
});

describe('Cross-contamination guard', () => {
  test('record written via ICPLC does not appear in TII query', () => {
    const icplcRecord = { id: 'new', email: 'eve@example.com', event_config_id: ICPLC_CONFIG.id };
    const pool = [...ALL_REGISTRATIONS, icplcRecord];
    const tiiFilter = resolveEventFilter(null);
    const tiiView = applyEventFilter(pool, tiiFilter);
    expect(tiiView.find(r => r.id === 'new')).toBeUndefined();
  });

  test('historical TII record does not appear in ICPLC query', () => {
    const icplcFilter = resolveEventFilter(ICPLC_CONFIG);
    const icplcView = applyEventFilter(ALL_REGISTRATIONS, icplcFilter);
    const historicalRecords = icplcView.filter(r => r.event_config_id === null);
    expect(historicalRecords.length).toBe(0);
  });
});
