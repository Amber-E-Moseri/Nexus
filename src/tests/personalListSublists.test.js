import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import {
  getPersonalSublists,
  createPersonalSublist,
  updatePersonalSublist,
  deletePersonalSublist,
  getOrCreateDefaultSublist,
  moveTaskToSublist,
} from '../features/tasks/lib/personalSublist'

describe('Personal List Sublists', () => {
  const testUserId = 'test-user-123'
  const testListId = 'test-list-123'
  const testTaskId = 'test-task-123'

  describe('getPersonalSublists', () => {
    it('should fetch all sublists for a user', async () => {
      const mockData = [
        { id: testListId, user_id: testUserId, name: 'This Week', is_default: true, sort_order: 0 },
      ]

      vi.spyOn(supabase, 'from').mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValueOnce({ data: mockData, error: null }),
      })

      const result = await getPersonalSublists(testUserId)
      expect(result).toEqual(mockData)
    })
  })

  describe('createPersonalSublist', () => {
    it('should create a new sublist', async () => {
      const newSublist = { id: testListId, user_id: testUserId, name: 'Someday', is_default: false }

      vi.spyOn(supabase, 'from').mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: newSublist, error: null }),
      })

      const result = await createPersonalSublist(testUserId, 'Someday')
      expect(result).toEqual(newSublist)
    })

    it('should reject empty names', async () => {
      await expect(createPersonalSublist(testUserId, '')).rejects.toThrow('Sublist name is required')
    })
  })

  describe('getOrCreateDefaultSublist', () => {
    it('should return existing default sublist', async () => {
      const defaultSublist = { id: testListId, user_id: testUserId, name: 'All Tasks', is_default: true }

      vi.spyOn(supabase, 'from').mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: defaultSublist, error: null }),
      })

      const result = await getOrCreateDefaultSublist(testUserId)
      expect(result).toEqual(defaultSublist)
    })

    it('should create default sublist if not exists', async () => {
      const defaultSublist = { id: testListId, user_id: testUserId, name: 'All Tasks', is_default: true }

      // First call returns 404, second call creates
      vi.spyOn(supabase, 'from')
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }),
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({ data: defaultSublist, error: null }),
        })

      const result = await getOrCreateDefaultSublist(testUserId)
      expect(result).toEqual(defaultSublist)
    })
  })

  describe('moveTaskToSublist', () => {
    it('should update task with new sublist', async () => {
      vi.spyOn(supabase, 'from').mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockResolvedValueOnce({ error: null }),
        }),
      })

      await expect(moveTaskToSublist(testTaskId, testListId)).resolves.toBeUndefined()
    })
  })

  describe('deletePersonalSublist', () => {
    it('should prevent deletion of default sublist', async () => {
      vi.spyOn(supabase, 'from').mockReturnValueOnce({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockResolvedValueOnce({ error: { message: 'Cannot delete the default sublist' } }),
        }),
      })

      await expect(deletePersonalSublist(testUserId, testListId)).rejects.toThrow(
        'Cannot delete the default sublist',
      )
    })
  })
})
