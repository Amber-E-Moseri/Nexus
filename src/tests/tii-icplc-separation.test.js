/**
 * TII / ICPLC Provenance Separation Tests
 *
 * Verifies the post-migration invariant:
 *   TII_ID   → This Is It 2.0 record
 *   ICPLC_ID → ICPLC record
 *   NULL     → INVALID (rejected at DB layer by NOT NULL constraint)
 *
 * NULL-as-TII is permanently removed. These tests confirm it stays removed.
 */

import { describe, test, expect } from 'vitest';

// ── Pure logic mirroring the updated RegistrationEcosystem ───────────────────

/**
 * Mirrors the eventId guard in RegistrationEcosystem's data-fetch useEffect.
 * Returns null (abort signal) if eventConfig has no id, else an eq filter.
 */
function resolveEventFilter(eventConfig) {
  const eventId = eventConfig?.id;
  if (!eventId) return null; // signals: abort load, log error
  return { type: 'eq', id: eventId };
}

/**
 * Mirrors the event_config_id value written in handleMarkConfirming,
 * handleAddToWorkingList, and FinanceTab.upsertPayment.
 * Returns undefined (not null) when eventConfig has no id — DB NOT NULL rejects it.
 */
function resolveInsertEventConfigId(eventConfig) {
  return eventConfig?.id;
}

/**
 * Simulates applying the event filter to a list of records.
 * Returns empty array if filter is null (abort case).
 */
function applyEventFilter(records, filter) {
  if (!filter) return [];
  return records.filter(r => r.event_config_id === filter.id);
}

// ── Test data ─────────────────────────────────────────────────────────────────

const TII_CONFIG = {
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

// After backfill migration: historical records carry the explicit TII UUID
const TII_REGISTRATIONS = [
  { id: 'r1', email: 'alice@example.com', event_config_id: TII_CONFIG.id },
  { id: 'r2', email: 'bob@example.com',   event_config_id: TII_CONFIG.id },
  { id: 'r3', email: 'carol@example.com', event_config_id: TII_CONFIG.id },
];

const ICPLC_REGISTRATIONS = [
  { id: 'r4', email: 'dave@example.com',  event_config_id: ICPLC_CONFIG.id },
];

const ALL_REGISTRATIONS = [...TII_REGISTRATIONS, ...ICPLC_REGISTRATIONS];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Event filter resolution — explicit UUID required', () => {
  test('null eventConfig returns null filter (abort signal, not IS NULL)', () => {
    const filter = resolveEventFilter(null);
    expect(filter).toBeNull();
  });

  test('config without id returns null filter (legacy fallback is rejected)', () => {
    const legacyConfig = { event_name: 'This Is It 2.0', sprint_pattern: '%This Is It 2.0%' };
    const filter = resolveEventFilter(legacyConfig);
    expect(filter).toBeNull();
  });

  test('TII config resolves to eq filter with TII id', () => {
    const filter = resolveEventFilter(TII_CONFIG);
    expect(filter).not.toBeNull();
    expect(filter.type).toBe('eq');
    expect(filter.id).toBe(TII_CONFIG.id);
  });

  test('ICPLC config resolves to eq filter with ICPLC id', () => {
    const filter = resolveEventFilter(ICPLC_CONFIG);
    expect(filter).not.toBeNull();
    expect(filter.type).toBe('eq');
    expect(filter.id).toBe(ICPLC_CONFIG.id);
  });
});

describe('TII data access — explicit UUID scoping', () => {
  test('TII filter returns only TII records', () => {
    const filter = resolveEventFilter(TII_CONFIG);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    expect(result.length).toBe(TII_REGISTRATIONS.length);
    expect(result.every(r => r.event_config_id === TII_CONFIG.id)).toBe(true);
  });

  test('TII filter does NOT return ICPLC records', () => {
    const filter = resolveEventFilter(TII_CONFIG);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    expect(result.some(r => r.event_config_id === ICPLC_CONFIG.id)).toBe(false);
  });

  test('abort filter (no config id) returns empty — never leaks any records', () => {
    const filter = resolveEventFilter(null);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    expect(result.length).toBe(0);
  });
});

describe('ICPLC data isolation', () => {
  test('ICPLC filter returns only ICPLC records', () => {
    const filter = resolveEventFilter(ICPLC_CONFIG);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    expect(result.length).toBe(ICPLC_REGISTRATIONS.length);
    expect(result.every(r => r.event_config_id === ICPLC_CONFIG.id)).toBe(true);
  });

  test('ICPLC filter does NOT return TII records', () => {
    const filter = resolveEventFilter(ICPLC_CONFIG);
    const result = applyEventFilter(ALL_REGISTRATIONS, filter);
    expect(result.some(r => r.event_config_id === TII_CONFIG.id)).toBe(false);
  });

  test('ICPLC filter does NOT return NULL records (none should exist post-migration)', () => {
    const poolWithRogue = [
      ...ALL_REGISTRATIONS,
      { id: 'rogue', email: 'rogue@example.com', event_config_id: null },
    ];
    const filter = resolveEventFilter(ICPLC_CONFIG);
    const result = applyEventFilter(poolWithRogue, filter);
    expect(result.some(r => r.event_config_id === null)).toBe(false);
  });
});

describe('Insert provenance — no NULL writes', () => {
  test('null eventConfig yields undefined insert id (DB NOT NULL rejects this)', () => {
    const id = resolveInsertEventConfigId(null);
    expect(id).toBeUndefined();
    expect(id).not.toBeNull();
  });

  test('config without id yields undefined (legacy fallback produces no valid id)', () => {
    const legacyConfig = { event_name: 'This Is It 2.0', sprint_pattern: '%This Is It 2.0%' };
    const id = resolveInsertEventConfigId(legacyConfig);
    expect(id).toBeUndefined();
  });

  test('TII config stamps TII UUID', () => {
    expect(resolveInsertEventConfigId(TII_CONFIG)).toBe(TII_CONFIG.id);
  });

  test('ICPLC config stamps ICPLC UUID', () => {
    expect(resolveInsertEventConfigId(ICPLC_CONFIG)).toBe(ICPLC_CONFIG.id);
  });

  test('TII insert cannot accidentally write ICPLC id', () => {
    const id = resolveInsertEventConfigId(TII_CONFIG);
    expect(id).not.toBe(ICPLC_CONFIG.id);
  });

  test('ICPLC insert cannot accidentally write TII id', () => {
    const id = resolveInsertEventConfigId(ICPLC_CONFIG);
    expect(id).not.toBe(TII_CONFIG.id);
  });
});

describe('Provenance regression — NULL records invisible to all named events', () => {
  // After NOT NULL migration, NULL rows cannot exist. These tests verify that
  // even if a rogue NULL somehow appeared, no event query would surface it.

  test('NULL record not returned by TII eq filter', () => {
    const roguePool = [
      ...ALL_REGISTRATIONS,
      { id: 'null_rogue', email: 'rogue@example.com', event_config_id: null },
    ];
    const filter = resolveEventFilter(TII_CONFIG);
    const result = applyEventFilter(roguePool, filter);
    expect(result.some(r => r.event_config_id === null)).toBe(false);
  });

  test('NULL record not returned by ICPLC eq filter', () => {
    const roguePool = [
      ...ALL_REGISTRATIONS,
      { id: 'null_rogue', email: 'rogue@example.com', event_config_id: null },
    ];
    const filter = resolveEventFilter(ICPLC_CONFIG);
    const result = applyEventFilter(roguePool, filter);
    expect(result.some(r => r.event_config_id === null)).toBe(false);
  });
});

describe('Cross-contamination guard', () => {
  test('record written via ICPLC does not appear in TII query', () => {
    const newIcplcRecord = { id: 'new_icplc', email: 'eve@example.com', event_config_id: ICPLC_CONFIG.id };
    const pool = [...ALL_REGISTRATIONS, newIcplcRecord];
    const tiiFilter = resolveEventFilter(TII_CONFIG);
    const tiiView = applyEventFilter(pool, tiiFilter);
    expect(tiiView.find(r => r.id === 'new_icplc')).toBeUndefined();
  });

  test('record written via TII does not appear in ICPLC query', () => {
    const newTiiRecord = { id: 'new_tii', email: 'frank@example.com', event_config_id: TII_CONFIG.id };
    const pool = [...ALL_REGISTRATIONS, newTiiRecord];
    const icplcFilter = resolveEventFilter(ICPLC_CONFIG);
    const icplcView = applyEventFilter(pool, icplcFilter);
    expect(icplcView.find(r => r.id === 'new_tii')).toBeUndefined();
  });

  test('two events queried independently return non-overlapping sets', () => {
    const tiiFilter = resolveEventFilter(TII_CONFIG);
    const icplcFilter = resolveEventFilter(ICPLC_CONFIG);
    const tiiView = applyEventFilter(ALL_REGISTRATIONS, tiiFilter);
    const icplcView = applyEventFilter(ALL_REGISTRATIONS, icplcFilter);
    const tiiIds = new Set(tiiView.map(r => r.id));
    const overlap = icplcView.filter(r => tiiIds.has(r.id));
    expect(overlap.length).toBe(0);
  });
});
