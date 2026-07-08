/**
 * Tests for SSE line-buffering parser (sseParser.js)
 * Covers: CRLF handling, malformed events, buffer overflow
 */

import { describe, it, expect, vi } from 'vitest'
import { processSSELines } from './sseParser'

describe('processSSELines', () => {
  describe('Line ending handling', () => {
    it('handles LF line endings correctly', () => {
      const buffer = ''
      const chunk = 'data: {"text":"hello"}\ndata: {"text":"world"}\n'

      const { updatedBuffer, events } = processSSELines(buffer, chunk)

      expect(events).toHaveLength(2)
      expect(events[0]).toEqual({ text: 'hello' })
      expect(events[1]).toEqual({ text: 'world' })
      expect(updatedBuffer).toBe('')
    })

    it('handles CRLF line endings correctly', () => {
      const buffer = ''
      const chunk = 'data: {"text":"hello"}\r\ndata: {"text":"world"}\r\n'

      const { updatedBuffer, events } = processSSELines(buffer, chunk)

      expect(events).toHaveLength(2)
      expect(events[0]).toEqual({ text: 'hello' })
      expect(events[1]).toEqual({ text: 'world' })
      expect(updatedBuffer).toBe('')
    })

    it('handles mixed LF and CRLF line endings', () => {
      const buffer = ''
      const chunk = 'data: {"text":"first"}\ndata: {"text":"second"}\r\ndata: {"text":"third"}\n'

      const { updatedBuffer, events } = processSSELines(buffer, chunk)

      expect(events).toHaveLength(3)
      expect(events[0]).toEqual({ text: 'first' })
      expect(events[1]).toEqual({ text: 'second' })
      expect(events[2]).toEqual({ text: 'third' })
      expect(updatedBuffer).toBe('')
    })

    it('handles CRLF with trailing CR in incomplete buffer', () => {
      const buffer = ''
      const chunk = 'data: {"text":"hello"}\r\ndata: {"text":"world"}\r'

      const { updatedBuffer, events } = processSSELines(buffer, chunk)

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({ text: 'hello' })
      // Incomplete line with trailing \r should be in buffer for next chunk
      expect(updatedBuffer).toBe('data: {"text":"world"}\r')
    })
  })

  describe('Malformed event handling', () => {
    it('skips malformed JSON event and continues parsing', () => {
      const buffer = ''
      const chunk = 'data: {"text":"valid1"}\ndata: {invalid json}\ndata: {"text":"valid2"}\n'

      // Suppress console.error during test
      const errorSpy = vi.spyOn(console, 'error').mockImplementation()

      const { updatedBuffer, events } = processSSELines(buffer, chunk)

      expect(events).toHaveLength(2)
      expect(events[0]).toEqual({ text: 'valid1' })
      expect(events[1]).toEqual({ text: 'valid2' })
      expect(updatedBuffer).toBe('')

      // Confirm the malformed event was logged
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping malformed SSE event'),
        expect.any(String),
        expect.stringContaining('data: {invalid json}')
      )

      errorSpy.mockRestore()
    })

    it('includes raw line in error log for malformed events', () => {
      const buffer = ''
      const chunk = 'data: {"incomplete": \ndata: {"text":"valid"}\n'

      const errorSpy = vi.spyOn(console, 'error').mockImplementation()

      processSSELines(buffer, chunk)

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping malformed SSE event'),
        expect.any(String),
        'data: {"incomplete": '
      )

      errorSpy.mockRestore()
    })

    it('does not crash on null values in event', () => {
      const buffer = ''
      const chunk = 'data: {"text":null}\ndata: {"text":"valid"}\n'

      const { events } = processSSELines(buffer, chunk)

      expect(events).toHaveLength(2)
      expect(events[0]).toEqual({ text: null })
      expect(events[1]).toEqual({ text: 'valid' })
    })
  })

  describe('Buffer overflow protection', () => {
    it('returns error when buffer exceeds MAX_BUFFER_SIZE without newline', () => {
      const buffer = ''
      // Create a chunk just over 512KB without a newline
      const chunk = 'x'.repeat(524_289)

      const errorSpy = vi.spyOn(console, 'error').mockImplementation()

      const { updatedBuffer, events, error } = processSSELines(buffer, chunk)

      expect(error).toBe('buffer_overflow')
      expect(events).toHaveLength(0)
      expect(updatedBuffer).toBe('')

      // Confirm the overflow was logged
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Buffer overflow'),
        524_289,
        524_288
      )

      errorSpy.mockRestore()
    })

    it('does not trigger overflow when buffer has newlines', () => {
      const buffer = ''
      // Create a chunk larger than threshold, but it has newlines so it's OK
      const chunk = 'data: {"text":"' + 'x'.repeat(100_000) + '"}\n' + 'x'.repeat(450_000) + '\n'

      const { error } = processSSELines(buffer, chunk)

      expect(error).toBeUndefined()
    })

    it('accumulates buffer across chunks without overflow', () => {
      let buffer = ''

      // Process 5 chunks of 100KB each = 500KB total (under 512KB limit)
      for (let i = 0; i < 5; i++) {
        const chunk = 'x'.repeat(100_000) + '\n'
        const result = processSSELines(buffer, chunk)
        buffer = result.updatedBuffer
        expect(result.error).toBeUndefined()
      }

      // 6th chunk would exceed limit
      const overflowChunk = 'x'.repeat(100_000) + '\n'
      const { error } = processSSELines(buffer, overflowChunk)

      // If combined with existing buffer, should NOT overflow if previous buffer is empty
      // (since each chunk clears the buffer on finding newlines)
      expect(error).toBeUndefined()
    })

    it('clears buffer after overflow to prevent cascading failures', () => {
      // First call: overflow
      const overflowChunk = 'x'.repeat(524_289)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation()

      let result = processSSELines('', overflowChunk)
      expect(result.error).toBe('buffer_overflow')
      expect(result.updatedBuffer).toBe('')

      // Second call: should start fresh with normal data
      const normalChunk = 'data: {"text":"hello"}\n'
      result = processSSELines(result.updatedBuffer, normalChunk)

      expect(result.error).toBeUndefined()
      expect(result.events).toHaveLength(1)
      expect(result.events[0]).toEqual({ text: 'hello' })

      errorSpy.mockRestore()
    })
  })

  describe('Non-SSE lines and edge cases', () => {
    it('ignores non-SSE lines (no "data: " prefix)', () => {
      const buffer = ''
      const chunk = ': comment\ndata: {"text":"hello"}\nsome random line\ndata: {"text":"world"}\n'

      const { events } = processSSELines(buffer, chunk)

      expect(events).toHaveLength(2)
      expect(events[0]).toEqual({ text: 'hello' })
      expect(events[1]).toEqual({ text: 'world' })
    })

    it('handles empty chunks', () => {
      const buffer = ''
      const chunk = ''

      const { events, updatedBuffer } = processSSELines(buffer, chunk)

      expect(events).toHaveLength(0)
      expect(updatedBuffer).toBe('')
    })

    it('preserves partial lines across chunks', () => {
      let result = processSSELines('', 'data: {"text":"hel')
      expect(result.events).toHaveLength(0)
      expect(result.updatedBuffer).toBe('data: {"text":"hel')

      result = processSSELines(result.updatedBuffer, 'lo"}\n')
      expect(result.events).toHaveLength(1)
      expect(result.events[0]).toEqual({ text: 'hello' })
      expect(result.updatedBuffer).toBe('')
    })
  })
})
