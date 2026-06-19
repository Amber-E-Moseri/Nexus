import { describe, it, expect, beforeEach, vi } from 'vitest'
import { matchPersonToUser, importElvantoAttendance } from './attendanceImportLib'
import * as supabaseModule from '../supabase'

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('matchPersonToUser', () => {
  let mockFrom: any

  beforeEach(() => {
    mockFrom = vi.fn()
    supabaseModule.supabase.from = mockFrom
  })

  it('should match person by external_id', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'user-123', name: 'John Doe' },
        error: null,
      }),
    }

    mockFrom.mockReturnValue(mockQuery)

    const result = await matchPersonToUser('John Doe', 'person_123')

    expect(result.matched).toBe(true)
    expect(result.userId).toBe('user-123')
  })

  it('should fall back to exact name match if external_id not found', async () => {
    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation(function () {
        this.maybeSingle = vi.fn().mockResolvedValue({
          data: null,
          error: null,
        })
        return this
      }),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: 'user-456', name: 'John Doe' }],
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }))

    const result = await matchPersonToUser('John Doe', 'unknown_id')

    expect(result.matched).toBe(true)
    expect(result.userId).toBe('user-456')
  })

  it('should return error if person not found', async () => {
    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }))

    const result = await matchPersonToUser('Unknown Person')

    expect(result.matched).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should handle empty person name', async () => {
    const result = await matchPersonToUser('')

    expect(result.matched).toBe(false)
    expect(result.error).toBe('Empty person name')
  })
})

describe('importElvantoAttendance', () => {
  let mockFrom: any

  beforeEach(() => {
    mockFrom = vi.fn()
    supabaseModule.supabase.from = mockFrom
  })

  it('should return empty summary for empty records', async () => {
    const result = await importElvantoAttendance([], 'meeting-123')

    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.mismatches.length).toBe(0)
  })

  it('should batch upsert matched records', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'user-123', name: 'John Doe' }],
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }
      }
      if (table === 'meeting_attendance') {
        return {
          upsert: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }
      }
    })

    const records = [
      {
        meeting_name: 'Test',
        date: '2024-06-16',
        person_name: 'John Doe',
        status: 'present' as const,
      },
      {
        meeting_name: 'Test',
        date: '2024-06-16',
        person_name: 'Jane Smith',
        status: 'absent' as const,
      },
    ]

    const result = await importElvantoAttendance(records, 'meeting-123')

    expect(result.imported).toBeGreaterThanOrEqual(0)
    expect(result.skipped).toBeGreaterThanOrEqual(0)
  })

  it('should track mismatches for unmatched people', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }
      }
      if (table === 'meeting_attendance') {
        return {
          upsert: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }
      }
    })

    const records = [
      {
        meeting_name: 'Test',
        date: '2024-06-16',
        person_name: 'Unknown Person',
        status: 'present' as const,
      },
    ]

    const result = await importElvantoAttendance(records, 'meeting-123')

    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.mismatches.length).toBe(1)
    expect(result.mismatches[0].person_name).toBe('Unknown Person')
  })

  it('should include attendance percentage in upsert', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ data: [], error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'user-123', name: 'John Doe' }],
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }
      }
      if (table === 'meeting_attendance') {
        return { upsert: upsertSpy }
      }
    })

    const records = [
      {
        meeting_name: 'Test',
        date: '2024-06-16',
        person_name: 'John Doe',
        status: 'present' as const,
        attendance_percentage: 95,
      },
    ]

    await importElvantoAttendance(records, 'meeting-123')

    const upsertCall = upsertSpy.mock.calls[0]
    expect(upsertCall[0][0].attendance_percentage).toBe(95)
    expect(upsertCall[0][0].source).toBe('elvanto_import')
  })

  it('should throw error if batch upsert fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'user-123', name: 'John Doe' }],
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }
      }
      if (table === 'meeting_attendance') {
        return {
          upsert: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }
      }
    })

    const records = [
      {
        meeting_name: 'Test',
        date: '2024-06-16',
        person_name: 'John Doe',
        status: 'present' as const,
      },
    ]

    await expect(importElvantoAttendance(records, 'meeting-123')).rejects.toThrow()
  })
})
