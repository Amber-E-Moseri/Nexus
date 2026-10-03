/* @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const queries = []
const tableResults = new Map()

function makeBuilder(capture) {
  const builder = {}
  for (const name of ['select', 'eq', 'order']) {
    builder[name] = (...args) => {
      capture.steps.push([name, ...args])
      return builder
    }
  }
  builder.then = (resolve) => {
    const result = tableResults.get(capture.table) ?? { data: [], error: null }
    return resolve(result)
  }
  return builder
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from(table) {
      const capture = { table, steps: [] }
      queries.push(capture)
      return makeBuilder(capture)
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}))

vi.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'current-user' }, role: 'super_admin', effectiveRole: 'super_admin' }),
}))

const { getSpaceMembers } = await import('../src/features/spaces/lib/spaces.js')
const { getSprintMembers } = await import('../src/features/tasks/lib/tasks.js')
const { SpaceMembersTab } = await import('../src/pages/spaces/SpaceOverview.jsx')

function setTable(table, data, error = null) {
  tableResults.set(table, { data, error })
}

function selectFor(table) {
  return queries
    .filter((query) => query.table === table)
    .flatMap((query) => query.steps.filter(([method]) => method === 'select').map(([, select]) => select))
}

beforeEach(() => {
  cleanup()
  queries.length = 0
  tableResults.clear()
})

describe('department space member source', () => {
  it('loads department members from users.department_id with the expected count and role data', async () => {
    setTable('users', [
      { id: 'media-lead', name: 'Media Lead', email: 'lead@example.com', role: 'dept_lead', department_id: 'media' },
      { id: 'media-member', name: 'Media Member', email: 'member@example.com', role: 'member', department_id: 'media' },
    ])

    const members = await getSpaceMembers({ id: 'media', space_type: 'department' })

    expect(members).toHaveLength(2)
    expect(members.map((member) => member.name)).toEqual(['Media Lead', 'Media Member'])
    expect(members[0].role).toBe('dept_lead')
    expect(queries.map((query) => query.table)).toEqual(['users'])
    expect(queries[0].steps).toContainEqual(['eq', 'department_id', 'media'])
  })

  it('uses schema-backed user fields and does not require avatar_color', async () => {
    setTable('users', [])

    await getSpaceMembers({ id: 'media', space_type: 'department' })

    const [select] = selectFor('users')
    expect(select).toContain('avatar_url')
    expect(select).not.toContain('avatar_color')
  })

  it('shows a real department empty state only when the authoritative user query returns zero rows', async () => {
    setTable('users', [])

    const members = await getSpaceMembers({ id: 'empty-dept', space_type: 'department' })

    expect(members).toEqual([])
  })

  it('does not turn a sprint-only member into a department member', async () => {
    setTable('users', [])
    setTable('sprint_members', [{ user: { id: 'sprint-only', name: 'Sprint Only', status: 'active' } }])

    const members = await getSpaceMembers({ id: 'media', space_type: 'department' })

    expect(members).toEqual([])
    expect(queries.map((query) => query.table)).not.toContain('sprint_members')
  })

  it('does not let multi-team sprint membership affect department membership', async () => {
    setTable('users', [])
    setTable('sprint_team_members', [
      { user_id: 'multi-team', team_id: 'team-a' },
      { user_id: 'multi-team', team_id: 'team-b' },
    ])

    const members = await getSpaceMembers({ id: 'media', space_type: 'department' })

    expect(members).toEqual([])
    expect(queries.map((query) => query.table)).not.toContain('sprint_team_members')
  })

  it('keeps existing sprint member loading on the sprint membership table', async () => {
    setTable('sprint_members', [
      { user: { id: 'sprint-member', name: 'Sprint Member', status: 'active' } },
    ])

    const members = await getSprintMembers('sprint-1')

    expect(members).toEqual([{ id: 'sprint-member', name: 'Sprint Member', status: 'active' }])
    expect(queries.map((query) => query.table)).toContain('sprint_members')
  })
})

describe('SpaceMembersTab rendering', () => {
  it('renders department members, count, and department role without sprint-team chips', () => {
    render(
      <SpaceMembersTab
        members={[
          { id: 'media-lead', name: 'Media Lead', email: 'lead@example.com', role: 'dept_lead' },
          { id: 'media-member', name: 'Media Member', email: 'member@example.com', role: 'member', sprint_team: 'Photo' },
        ]}
        spaceId="media"
        spaceName="Media"
        spaceType="department"
        canManage
      />,
    )

    expect(screen.getByRole('heading', { name: 'Members' })).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('People who belong to the Media department.')).toBeTruthy()
    expect(screen.getByText('Media Lead')).toBeTruthy()
    expect(screen.getByText('Dept Lead')).toBeTruthy()
    expect(screen.getByText('Media Member')).toBeTruthy()
    expect(screen.getAllByText('Member').length).toBeGreaterThan(0)
    expect(screen.queryByText('Photo')).toBeNull()
  })

  it('renders the true empty department state', () => {
    render(
      <SpaceMembersTab
        members={[]}
        spaceId="media"
        spaceName="Media"
        spaceType="department"
        canManage
      />,
    )

    expect(screen.getByText('No members yet')).toBeTruthy()
    expect(screen.getByText('Add people to this department to start collaborating.')).toBeTruthy()
    expect(screen.queryByText('No members found.')).toBeNull()
  })

  it('does not render the empty state while loading', () => {
    render(
      <SpaceMembersTab
        members={[]}
        spaceId="media"
        spaceName="Media"
        spaceType="department"
        canManage
        membersLoading
      />,
    )

    expect(screen.getByText('Loading members')).toBeTruthy()
    expect(screen.queryByText('No members yet')).toBeNull()
    expect(screen.queryByText('No members found.')).toBeNull()
  })

  it('does not show stale member rows during a subsequent loading state', () => {
    render(
      <SpaceMembersTab
        members={[{ id: 'old-media-member', name: 'Old Media Member', email: 'old@example.com', role: 'member' }]}
        spaceId="admin"
        spaceName="Admin"
        spaceType="department"
        canManage
        membersLoading
      />,
    )

    expect(screen.getByText('Loading members')).toBeTruthy()
    expect(screen.queryByText('Old Media Member')).toBeNull()
    expect(screen.queryByText('No members found.')).toBeNull()
  })

  it('does not render "No members found" on query failure', () => {
    render(
      <SpaceMembersTab
        members={[]}
        spaceId="media"
        spaceName="Media"
        spaceType="department"
        canManage
        membersError="column users.avatar_color does not exist"
      />,
    )

    expect(screen.getByText('Members could not be loaded.')).toBeTruthy()
    expect(screen.getByText('column users.avatar_color does not exist')).toBeTruthy()
    expect(screen.queryByText('No members found.')).toBeNull()
    expect(screen.queryByText('No members yet')).toBeNull()
  })

  it('does not show stale member rows during a query failure state', () => {
    render(
      <SpaceMembersTab
        members={[{ id: 'old-media-member', name: 'Old Media Member', email: 'old@example.com', role: 'member' }]}
        spaceId="admin"
        spaceName="Admin"
        spaceType="department"
        canManage
        membersError="permission denied for table users"
      />,
    )

    expect(screen.getByText('Members could not be loaded.')).toBeTruthy()
    expect(screen.queryByText('Old Media Member')).toBeNull()
    expect(screen.queryByText('No members found.')).toBeNull()
  })
})
