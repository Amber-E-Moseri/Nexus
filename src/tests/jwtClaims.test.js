/**
 * Tests for JWT custom claims logic (mirrors custom_access_token_hook SQL function).
 *
 * The actual hook runs in PostgreSQL and cannot be unit-tested directly, so we
 * extract its pure claim-building logic into buildJwtClaims() and verify the
 * expected behavior at the JS boundary.
 *
 * Key invariants being tested:
 *   1. department_id = NULL  → user_department_id claim = 'none' (never SQL NULL)
 *   2. department_id = uuid  → user_department_id claim = that uuid as a string
 *   3. role = NULL           → user_role claim = 'member' (safe fallback)
 *   4. role = any string     → user_role claim = that string unchanged
 *   5. Other existing claims are not clobbered
 *   6. user_department_id is always present in the returned claims object
 */

import { describe, test, expect } from 'vitest';

/**
 * Pure JS mirror of the custom_access_token_hook claim-injection logic.
 *
 * @param {object} userRecord   - Row from the users table. Must have: role, department_id.
 * @param {object} existingClaims - Claims already on the token (default: {}).
 * @returns {object} New claims object with user_role and user_department_id injected.
 */
function buildJwtClaims(userRecord, existingClaims = {}) {
  if (!userRecord) {
    return existingClaims;
  }

  const claims = { ...existingClaims };

  // Mirror SQL: CASE WHEN role IS NULL THEN 'member' ELSE role END
  claims.user_role =
    userRecord.role == null || userRecord.role === ''
      ? 'member'
      : userRecord.role;

  // Mirror SQL: CASE WHEN department_id IS NULL THEN 'none' ELSE department_id::text END
  claims.user_department_id =
    userRecord.department_id == null
      ? 'none'
      : String(userRecord.department_id);

  return claims;
}

/**
 * Mirror of current_user_department() SQL function.
 * Converts the 'none' sentinel back to null before UUID usage.
 *
 * @param {string|null} jwtDepartmentId - Value of user_department_id from JWT.
 * @returns {string|null} The UUID string, or null if 'none'/empty/null.
 */
function resolveUserDepartment(jwtDepartmentId) {
  if (!jwtDepartmentId || jwtDepartmentId === '' || jwtDepartmentId === 'none') {
    return null;
  }
  return jwtDepartmentId;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildJwtClaims — department_id handling
// ─────────────────────────────────────────────────────────────────────────────

describe('buildJwtClaims — user_department_id', () => {
  test('super_admin with no department gets user_department_id = "none"', () => {
    const user = { role: 'super_admin', department_id: null };
    const claims = buildJwtClaims(user);
    expect(claims.user_department_id).toBe('none');
  });

  test('uninvited user (department_id undefined) gets user_department_id = "none"', () => {
    const user = { role: 'member', department_id: undefined };
    const claims = buildJwtClaims(user);
    expect(claims.user_department_id).toBe('none');
  });

  test('user with a real department gets user_department_id = that UUID string', () => {
    const deptId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const user = { role: 'member', department_id: deptId };
    const claims = buildJwtClaims(user);
    expect(claims.user_department_id).toBe(deptId);
  });

  test('user_department_id key is always present in returned claims', () => {
    const user_no_dept = { role: 'super_admin', department_id: null };
    const user_with_dept = {
      role: 'dept_lead',
      department_id: '11111111-1111-1111-1111-111111111111',
    };
    expect(buildJwtClaims(user_no_dept)).toHaveProperty('user_department_id');
    expect(buildJwtClaims(user_with_dept)).toHaveProperty('user_department_id');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildJwtClaims — user_role handling
// ─────────────────────────────────────────────────────────────────────────────

describe('buildJwtClaims — user_role', () => {
  test('null role falls back to "member"', () => {
    const user = { role: null, department_id: null };
    const claims = buildJwtClaims(user);
    expect(claims.user_role).toBe('member');
  });

  test('super_admin role is preserved exactly', () => {
    const user = { role: 'super_admin', department_id: null };
    const claims = buildJwtClaims(user);
    expect(claims.user_role).toBe('super_admin');
  });

  test('dept_lead role is preserved exactly', () => {
    const deptId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const user = { role: 'dept_lead', department_id: deptId };
    const claims = buildJwtClaims(user);
    expect(claims.user_role).toBe('dept_lead');
  });

  test('member role is preserved exactly', () => {
    const deptId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const user = { role: 'member', department_id: deptId };
    const claims = buildJwtClaims(user);
    expect(claims.user_role).toBe('member');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildJwtClaims — full claims object integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('buildJwtClaims — other claims are not clobbered', () => {
  test('existing claims (sub, email, aud) are preserved alongside new fields', () => {
    const existing = {
      sub: 'user-uuid-here',
      email: 'admin@blwcanada.org',
      aud: 'authenticated',
    };
    const user = { role: 'super_admin', department_id: null };
    const claims = buildJwtClaims(user, existing);

    expect(claims.sub).toBe('user-uuid-here');
    expect(claims.email).toBe('admin@blwcanada.org');
    expect(claims.aud).toBe('authenticated');
    expect(claims.user_role).toBe('super_admin');
    expect(claims.user_department_id).toBe('none');
  });

  test('new claims do not overwrite unrelated existing keys', () => {
    const existing = { custom_claim: 'my_value', user_role: 'old_role' };
    const user = { role: 'member', department_id: '12345678-0000-0000-0000-000000000000' };
    const claims = buildJwtClaims(user, existing);

    expect(claims.custom_claim).toBe('my_value');
    // user_role should be replaced with the fresh value from the user record
    expect(claims.user_role).toBe('member');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildJwtClaims — null userRecord guard
// ─────────────────────────────────────────────────────────────────────────────

describe('buildJwtClaims — null userRecord (user not found)', () => {
  test('null userRecord returns existing claims unchanged (mirrors "if not found return event")', () => {
    const existing = { sub: 'ghost-user', aud: 'authenticated' };
    const claims = buildJwtClaims(null, existing);
    expect(claims).toEqual(existing);
    expect(claims).not.toHaveProperty('user_role');
    expect(claims).not.toHaveProperty('user_department_id');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveUserDepartment — mirrors current_user_department() SQL fix
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveUserDepartment — converting JWT claim back to usable UUID', () => {
  test('"none" sentinel resolves to null (super_admin with no department)', () => {
    expect(resolveUserDepartment('none')).toBeNull();
  });

  test('empty string resolves to null', () => {
    expect(resolveUserDepartment('')).toBeNull();
  });

  test('null resolves to null', () => {
    expect(resolveUserDepartment(null)).toBeNull();
  });

  test('real UUID string is returned as-is', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(resolveUserDepartment(uuid)).toBe(uuid);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Round-trip test: hook output → resolver → usable value
// ─────────────────────────────────────────────────────────────────────────────

describe('Round-trip: buildJwtClaims → resolveUserDepartment', () => {
  test('super_admin: null department_id → "none" in JWT → null in resolver', () => {
    const user = { role: 'super_admin', department_id: null };
    const claims = buildJwtClaims(user);
    const resolved = resolveUserDepartment(claims.user_department_id);
    expect(resolved).toBeNull();
  });

  test('dept_lead: real UUID → UUID string in JWT → same UUID back from resolver', () => {
    const deptId = 'deadbeef-dead-dead-dead-deaddeaddeadde';
    const user = { role: 'dept_lead', department_id: deptId };
    const claims = buildJwtClaims(user);
    const resolved = resolveUserDepartment(claims.user_department_id);
    expect(resolved).toBe(deptId);
  });
});
