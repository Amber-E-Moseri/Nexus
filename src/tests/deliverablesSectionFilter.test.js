// Tests for the writable-space filter logic used in DeliverablesSection.
// Exercises the same expressions as the component, using the real hasSpaceRole util.
import { describe, it, expect } from 'vitest'
import { hasSpaceRole } from '../lib/permissions'

const DEPT_A = 'dept-a'
const DEPT_B = 'dept-b'
const DEPT_C = 'dept-c'

const ALL_DEPTS = [
  { id: DEPT_A, name: 'Alpha' },
  { id: DEPT_B, name: 'Beta' },
  { id: DEPT_C, name: 'Gamma' },
]

const SPRINT_IN_A = { id: 'sprint-1', name: 'Sprint 1', department_id: DEPT_A, status: 'active' }
const SPRINT_IN_B = { id: 'sprint-2', name: 'Sprint 2', department_id: DEPT_B, status: 'active' }
const SPRINT_ORG_WIDE = { id: 'sprint-3', name: 'Sprint 3', department_id: null, status: 'active' }

const ALL_SPRINTS = [SPRINT_IN_A, SPRINT_IN_B, SPRINT_ORG_WIDE]

function computeWritableDepts(profile, allDepts) {
  return profile?.role === 'super_admin'
    ? allDepts
    : allDepts.filter(d =>
        profile?.department_id === d.id
        || hasSpaceRole(profile, d.id, 'dept_lead')
      )
}

function computeWritableSprints(profile, allSprints) {
  return profile?.role === 'super_admin'
    ? allSprints
    : allSprints.filter(s =>
        !s.department_id
        || profile?.department_id === s.department_id
        || hasSpaceRole(profile, s.department_id, 'dept_lead')
      )
}

describe('writableDepts filter', () => {
  it('super_admin sees all depts', () => {
    const profile = { role: 'super_admin', department_id: DEPT_A, space_roles: [] }
    expect(computeWritableDepts(profile, ALL_DEPTS)).toEqual(ALL_DEPTS)
  })

  it('dept_lead sees only home dept when no space_roles', () => {
    const profile = { role: 'dept_lead', department_id: DEPT_A, space_roles: [] }
    const result = computeWritableDepts(profile, ALL_DEPTS)
    expect(result.map(d => d.id)).toEqual([DEPT_A])
  })

  it('dept_lead with space_role in another dept sees both', () => {
    const profile = {
      role: 'dept_lead',
      department_id: DEPT_A,
      space_roles: [{ space_id: DEPT_B, role: 'dept_lead' }],
    }
    const result = computeWritableDepts(profile, ALL_DEPTS)
    expect(result.map(d => d.id)).toEqual([DEPT_A, DEPT_B])
  })

  it('member role sees only home dept', () => {
    const profile = { role: 'member', department_id: DEPT_B, space_roles: [] }
    const result = computeWritableDepts(profile, ALL_DEPTS)
    expect(result.map(d => d.id)).toEqual([DEPT_B])
  })

  it('cross-dept is excluded when user has no access there', () => {
    const profile = { role: 'dept_lead', department_id: DEPT_A, space_roles: [] }
    const result = computeWritableDepts(profile, ALL_DEPTS)
    expect(result.find(d => d.id === DEPT_C)).toBeUndefined()
  })

  it('null profile returns empty list', () => {
    expect(computeWritableDepts(null, ALL_DEPTS)).toEqual([])
  })
})

describe('writableSprints filter', () => {
  it('super_admin sees all sprints', () => {
    const profile = { role: 'super_admin', department_id: DEPT_A, space_roles: [] }
    expect(computeWritableSprints(profile, ALL_SPRINTS)).toEqual(ALL_SPRINTS)
  })

  it('dept_lead sees sprint in home dept + org-wide sprints', () => {
    const profile = { role: 'dept_lead', department_id: DEPT_A, space_roles: [] }
    const result = computeWritableSprints(profile, ALL_SPRINTS)
    expect(result.map(s => s.id)).toContain('sprint-1') // home dept
    expect(result.map(s => s.id)).toContain('sprint-3') // org-wide (null dept)
    expect(result.map(s => s.id)).not.toContain('sprint-2') // other dept
  })

  it('dept_lead with space_role in dept B also sees sprint in dept B', () => {
    const profile = {
      role: 'dept_lead',
      department_id: DEPT_A,
      space_roles: [{ space_id: DEPT_B, role: 'dept_lead' }],
    }
    const result = computeWritableSprints(profile, ALL_SPRINTS)
    expect(result.map(s => s.id)).toContain('sprint-2')
  })

  it('sprint in inaccessible dept is blocked', () => {
    const profile = { role: 'dept_lead', department_id: DEPT_A, space_roles: [] }
    const result = computeWritableSprints(profile, ALL_SPRINTS)
    expect(result.find(s => s.id === 'sprint-2')).toBeUndefined()
  })
})
