/**
 * BLW-08 — status hierarchy resolved server-side via get_task_status_hierarchy.
 * Broken mappings must surface visibly (errors array + console.error), never
 * silently resolve to null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: () => {
      throw new Error('getStatusHierarchy must not query tables directly (BLW-08)')
    },
  },
}))

const { getStatusHierarchy, getOrgStatusParent } = await import('../src/lib/taskStatuses.js')

beforeEach(() => {
  rpcMock.mockReset()
})

describe('getStatusHierarchy', () => {
  it('consumes the pre-joined RPC payload and groups dept statuses by parent', async () => {
    rpcMock.mockResolvedValue({
      data: {
        org_statuses: [
          { id: 'org-1', name: 'Not Started', category: 'open', is_org_status: true, sort_order: 1 },
        ],
        dept_statuses: [
          {
            id: 'dept-1', name: 'To Do', category: 'open', is_org_status: false,
            org_status_id: 'org-1', sort_order: 1,
            org_parent: { id: 'org-1', name: 'Not Started', category: 'open', is_org_status: true },
            hierarchy_error: null,
          },
        ],
      },
      error: null,
    })

    const hierarchy = await getStatusHierarchy({ departmentId: 'd1' })

    expect(rpcMock).toHaveBeenCalledWith('get_task_status_hierarchy', { p_department_id: 'd1' })
    expect(hierarchy.orgStatuses).toHaveLength(1)
    expect(hierarchy.byOrgParent['org-1']).toHaveLength(1)
    expect(hierarchy.errors).toEqual([])
  })

  it('surfaces broken mappings in errors and logs them', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpcMock.mockResolvedValue({
      data: {
        org_statuses: [],
        dept_statuses: [
          {
            id: 'dept-broken', name: 'Orphan', category: 'open', is_org_status: false,
            org_status_id: null, org_parent: null, hierarchy_error: 'missing_org_status_id',
          },
        ],
      },
      error: null,
    })

    const hierarchy = await getStatusHierarchy()

    expect(hierarchy.errors).toEqual([{ statusId: 'dept-broken', error: 'missing_org_status_id' }])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('getOrgStatusParent', () => {
  it('uses the pre-joined org_parent without another query', async () => {
    const parent = await getOrgStatusParent({
      id: 'dept-1', is_org_status: false, org_status_id: 'org-1',
      org_parent: { id: 'org-1', name: 'Not Started', category: 'open' },
    })
    expect(parent?.id).toBe('org-1')
  })

  it('logs an error (not a silent null) for a broken pre-joined mapping', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const parent = await getOrgStatusParent({
      id: 'dept-broken', name: 'Orphan', is_org_status: false,
      org_status_id: null, org_parent: null, hierarchy_error: 'missing_org_status_id',
    })
    expect(parent).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
