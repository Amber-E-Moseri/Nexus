import { describe, it, expect, vi } from 'vitest'

// ownerMatching pulls the org-directory fetchers from the automations lib,
// which imports the supabase client — mock it so the real matching logic can
// be imported and tested headless (no env vars, no network).
vi.mock('../src/features/automations/lib/automations', () => ({
  getAllDepartments: vi.fn(async () => []),
  getAllUsers: vi.fn(async () => []),
}))

import { matchUserByName, matchDepartmentByName, resolveAssignment } from '../src/features/meetings/lib/ownerMatching'

const users = [
  { id: 'u1', name: 'Amber Moseri', department_id: 'd1' },
  { id: 'u2', name: 'Dorcas Mensah', department_id: 'd2' },
  { id: 'u3', name: 'Dorcas Appiah', department_id: 'd3' },
  { id: 'u4', name: 'Alex Danso', department_id: null },
]

const departments = [
  { id: 'd1', name: 'Media' },
  { id: 'd2', name: 'Pastors' },
]

describe('matchUserByName', () => {
  it('matches full name case-insensitively', () => {
    expect(matchUserByName('amber moseri', users)?.id).toBe('u1')
    expect(matchUserByName('  Amber Moseri  ', users)?.id).toBe('u1')
  })

  it('matches a unique first name', () => {
    expect(matchUserByName('Amber', users)?.id).toBe('u1')
    expect(matchUserByName('Alex', users)?.id).toBe('u4')
  })

  it('returns null for an ambiguous first name (two Dorcases)', () => {
    expect(matchUserByName('Dorcas', users)).toBeNull()
  })

  it('resolves the ambiguity when the full name is given', () => {
    expect(matchUserByName('Dorcas Appiah', users)?.id).toBe('u3')
  })

  it('returns null for TBD / unassigned / empty owners', () => {
    expect(matchUserByName('TBD', users)).toBeNull()
    expect(matchUserByName('unassigned', users)).toBeNull()
    expect(matchUserByName('', users)).toBeNull()
    expect(matchUserByName(null, users)).toBeNull()
  })

  it('returns null for unknown names', () => {
    expect(matchUserByName('Someone External', users)).toBeNull()
  })
})

describe('matchDepartmentByName', () => {
  it('matches department names case-insensitively', () => {
    expect(matchDepartmentByName('media', departments)?.id).toBe('d1')
  })

  it('returns null for unknown or empty names', () => {
    expect(matchDepartmentByName('Finance', departments)).toBeNull()
    expect(matchDepartmentByName('', departments)).toBeNull()
  })
})

describe('resolveAssignment', () => {
  const directory = { users, departments }

  it('uses the matched user and THEIR department (not the AI space guess)', () => {
    const item = { owner: 'Amber Moseri', suggested_space: 'Pastors' }
    expect(resolveAssignment(item, directory)).toEqual({
      assigneeId: 'u1',
      departmentId: 'd1', // Amber's own dept, not the AI-suggested Pastors
      sprintId: null,
    })
  })

  it('falls back to the AI-suggested space when the owner is unresolvable', () => {
    const item = { owner: 'Dorcas', suggested_space: 'Pastors' }
    expect(resolveAssignment(item, directory)).toEqual({
      assigneeId: null,
      departmentId: 'd2',
      sprintId: null,
    })
  })

  it('falls back to the AI space when the matched user has no department', () => {
    const item = { owner: 'Alex Danso', suggested_space: 'Media' }
    expect(resolveAssignment(item, directory)).toEqual({
      assigneeId: 'u4',
      departmentId: 'd1',
      sprintId: null,
    })
  })

  it('returns all-null assignment when nothing matches', () => {
    const item = { owner: 'TBD', suggested_space: '' }
    expect(resolveAssignment(item, directory)).toEqual({
      assigneeId: null,
      departmentId: null,
      sprintId: null,
    })
  })
})
