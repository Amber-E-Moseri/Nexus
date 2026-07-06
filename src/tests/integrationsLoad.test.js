import { describe, test, expect } from 'vitest'
import { migrateIntegrationRow, buildSavePayload } from '../lib/integrations/loadTransform'

// Minimal valid row as Supabase would return it for a pre-migration record
const BASE_ROW = {
  id: 'int-1',
  name: 'Foundation School',
  type: 'foundation_school',
  launch_url: 'https://example.com',
  visible_to: 'all',
  enabled: true,
  show_in_sidebar: false,
  sort_order: 1,
}

describe('migrateIntegrationRow — loadIntegrations transform', () => {
  // -----------------------------------------------------------------------
  // Scenario 1: fully-populated row — real DB values must survive unchanged
  // -----------------------------------------------------------------------
  describe('fully-populated row (post-migration)', () => {
    const deptId1 = 'dept-aaaa-1111'
    const deptId2 = 'dept-bbbb-2222'

    test('scope is preserved as-is when set', () => {
      const row = { ...BASE_ROW, scope: 'departments', department_ids: [deptId1, deptId2], user_ids: [] }
      expect(migrateIntegrationRow(row).scope).toBe('departments')
    })

    test('department_ids array is preserved exactly', () => {
      const row = { ...BASE_ROW, scope: 'departments', department_ids: [deptId1, deptId2], user_ids: [] }
      expect(migrateIntegrationRow(row).department_ids).toEqual([deptId1, deptId2])
    })

    test('user_ids array is preserved exactly', () => {
      const userId = 'user-cccc-3333'
      const row = { ...BASE_ROW, scope: 'users', department_ids: [], user_ids: [userId] }
      expect(migrateIntegrationRow(row).user_ids).toEqual([userId])
    })

    test('all other fields pass through untouched', () => {
      const row = { ...BASE_ROW, scope: 'global', department_ids: [], user_ids: [] }
      const result = migrateIntegrationRow(row)
      expect(result.id).toBe(BASE_ROW.id)
      expect(result.name).toBe(BASE_ROW.name)
      expect(result.visible_to).toBe(BASE_ROW.visible_to)
      expect(result.enabled).toBe(BASE_ROW.enabled)
    })
  })

  // -----------------------------------------------------------------------
  // Scenario 2: pre-migration row (null columns) — defaults must be applied
  // -----------------------------------------------------------------------
  describe('pre-migration row (null scope/department_ids/user_ids)', () => {
    const nullRow = { ...BASE_ROW, scope: null, department_ids: null, user_ids: null }

    test('scope defaults to "global" when null', () => {
      expect(migrateIntegrationRow(nullRow).scope).toBe('global')
    })

    test('department_ids defaults to empty array when null', () => {
      expect(migrateIntegrationRow(nullRow).department_ids).toEqual([])
    })

    test('user_ids defaults to empty array when null', () => {
      expect(migrateIntegrationRow(nullRow).user_ids).toEqual([])
    })

    test('undefined columns also get defaults (missing from select)', () => {
      const rowWithUndefined = { ...BASE_ROW }
      // scope/department_ids/user_ids not present on object at all
      const result = migrateIntegrationRow(rowWithUndefined)
      expect(result.scope).toBe('global')
      expect(result.department_ids).toEqual([])
      expect(result.user_ids).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // Scenario 3: scope switch — stale sibling array is NOT cleared by transform
  // (clearing must happen at save-time; the transform is load-only)
  // NOTE: this documents current behaviour. If scope switching is cleaned up
  // at save time in the future, this test should be updated accordingly.
  // -----------------------------------------------------------------------
  describe('scope switch — stale sibling array behaviour', () => {
    test('switching scope to "users" leaves department_ids from DB intact on load', () => {
      // DB row where someone previously set scope=departments, saved dept IDs,
      // then changed scope=users and saved — but department_ids was not cleared.
      const deptId = 'dept-aaaa-1111'
      const userId = 'user-cccc-3333'
      const row = {
        ...BASE_ROW,
        scope: 'users',
        department_ids: [deptId], // stale — scope is now 'users'
        user_ids: [userId],
      }
      const result = migrateIntegrationRow(row)
      // Transform preserves whatever is in the DB — it does not infer scope to clear arrays.
      expect(result.scope).toBe('users')
      expect(result.user_ids).toEqual([userId])
      // Stale department_ids survive load (known limitation: save-time should clear these).
      expect(result.department_ids).toEqual([deptId])
    })

    test('switching scope to "departments" leaves user_ids from DB intact on load', () => {
      const deptId = 'dept-aaaa-1111'
      const userId = 'user-cccc-3333'
      const row = {
        ...BASE_ROW,
        scope: 'departments',
        department_ids: [deptId],
        user_ids: [userId], // stale — scope is now 'departments'
      }
      const result = migrateIntegrationRow(row)
      expect(result.scope).toBe('departments')
      expect(result.department_ids).toEqual([deptId])
      expect(result.user_ids).toEqual([userId]) // stale, not cleared by transform
    })
  })

  // -----------------------------------------------------------------------
  // Scenario 4: multiple rows — no value bleeding between rows
  // -----------------------------------------------------------------------
  describe('multiple rows — isolation', () => {
    const rows = [
      { ...BASE_ROW, id: 'int-A', scope: 'global',      department_ids: [],             user_ids: [] },
      { ...BASE_ROW, id: 'int-B', scope: 'departments',  department_ids: ['dept-1111'],  user_ids: [] },
      { ...BASE_ROW, id: 'int-C', scope: 'users',        department_ids: [],             user_ids: ['user-2222'] },
      { ...BASE_ROW, id: 'int-D', scope: null,           department_ids: null,           user_ids: null },
    ]

    const results = rows.map(migrateIntegrationRow)

    test('row A: global scope, empty arrays', () => {
      expect(results[0].scope).toBe('global')
      expect(results[0].department_ids).toEqual([])
      expect(results[0].user_ids).toEqual([])
    })

    test('row B: department scope with ids, no bleed from row A', () => {
      expect(results[1].scope).toBe('departments')
      expect(results[1].department_ids).toEqual(['dept-1111'])
      expect(results[1].user_ids).toEqual([])
    })

    test('row C: user scope with ids, no bleed from row B department_ids', () => {
      expect(results[2].scope).toBe('users')
      expect(results[2].department_ids).toEqual([])
      expect(results[2].user_ids).toEqual(['user-2222'])
    })

    test('row D: null columns get defaults, no bleed from row C user_ids', () => {
      expect(results[3].scope).toBe('global')
      expect(results[3].department_ids).toEqual([])
      expect(results[3].user_ids).toEqual([])
    })

    test('each result object is independent (mutating one does not affect another)', () => {
      results[1].department_ids.push('injected')
      expect(results[0].department_ids).toEqual([])
      expect(results[2].department_ids).toEqual([])
      expect(results[3].department_ids).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// buildSavePayload — scope-based sibling-field nulling
// ---------------------------------------------------------------------------

const BASE_DRAFT = {
  id: 'int-1',
  name: 'Test Integration',
  type: 'custom',
  launch_url: 'https://example.com',
  description: 'A test',
  icon_emoji: '🔗',
  visible_to: 'all',
  enabled: true,
  show_in_sidebar: false,
  sort_order: 1,
}

describe('buildSavePayload — scope-based sibling nulling', () => {
  // -------------------------------------------------------------------------
  // scope === 'global' — both arrays must be null in the DB payload
  // -------------------------------------------------------------------------
  describe('scope: global', () => {
    test('department_ids is null even when draft has stale values', () => {
      const draft = { ...BASE_DRAFT, scope: 'global', department_ids: ['dept-1'], user_ids: ['user-1'] }
      expect(buildSavePayload(draft).department_ids).toBeNull()
    })

    test('user_ids is null even when draft has stale values', () => {
      const draft = { ...BASE_DRAFT, scope: 'global', department_ids: ['dept-1'], user_ids: ['user-1'] }
      expect(buildSavePayload(draft).user_ids).toBeNull()
    })

    test('scope field is preserved in payload', () => {
      expect(buildSavePayload({ ...BASE_DRAFT, scope: 'global', department_ids: [], user_ids: [] }).scope).toBe('global')
    })
  })

  // -------------------------------------------------------------------------
  // scope === 'departments' — department_ids preserved, user_ids nulled
  // -------------------------------------------------------------------------
  describe('scope: departments', () => {
    const deptId1 = 'dept-aaaa-1111'
    const deptId2 = 'dept-bbbb-2222'

    test('department_ids is preserved in payload', () => {
      const draft = { ...BASE_DRAFT, scope: 'departments', department_ids: [deptId1, deptId2], user_ids: [] }
      expect(buildSavePayload(draft).department_ids).toEqual([deptId1, deptId2])
    })

    test('user_ids is null even when draft has stale values (scope switch scenario)', () => {
      const draft = { ...BASE_DRAFT, scope: 'departments', department_ids: [deptId1], user_ids: ['user-old'] }
      expect(buildSavePayload(draft).user_ids).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // scope === 'users' — user_ids preserved, department_ids nulled
  // The key regression scenario: departments→users switch with populated dept IDs
  // -------------------------------------------------------------------------
  describe('scope: users', () => {
    const userId = 'user-cccc-3333'

    test('user_ids is preserved in payload', () => {
      const draft = { ...BASE_DRAFT, scope: 'users', department_ids: [], user_ids: [userId] }
      expect(buildSavePayload(draft).user_ids).toEqual([userId])
    })

    test('department_ids is null after switching from departments scope (regression)', () => {
      // Simulate: was scope=departments with 2 depts, user switches to scope=users,
      // picks 1 user, saves — the old department_ids must NOT bleed into the payload.
      const draftAfterScopeSwitch = {
        ...BASE_DRAFT,
        scope: 'users',
        department_ids: ['dept-aaaa-1111', 'dept-bbbb-2222'], // stale, still in UI state
        user_ids: [userId],
      }
      expect(buildSavePayload(draftAfterScopeSwitch).department_ids).toBeNull()
    })

    test('full payload shape is correct after scope switch', () => {
      const draft = {
        ...BASE_DRAFT,
        scope: 'users',
        department_ids: ['dept-stale'],
        user_ids: [userId],
      }
      const payload = buildSavePayload(draft)
      expect(payload.scope).toBe('users')
      expect(payload.user_ids).toEqual([userId])
      expect(payload.department_ids).toBeNull()
      expect(payload.name).toBe('Test Integration')
      expect(payload.enabled).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // null/undefined draft values — graceful defaults
  // -------------------------------------------------------------------------
  describe('null/undefined scope in draft', () => {
    test('null scope defaults to global and nulls both arrays', () => {
      const draft = { ...BASE_DRAFT, scope: null, department_ids: ['dept-1'], user_ids: ['user-1'] }
      const payload = buildSavePayload(draft)
      expect(payload.scope).toBe('global')
      expect(payload.department_ids).toBeNull()
      expect(payload.user_ids).toBeNull()
    })
  })
})
