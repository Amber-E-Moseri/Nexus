/**
 * Unit tests for SSE line-buffering logic (processSSELines).
 *
 * All tests are pure — no DOM, no fetch, no ReadableStream.  They exercise
 * the processSSELines() helper that AudioTranscriptionPanel uses internally
 * to reconstruct complete SSE lines across multiple chunk boundaries.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { processSSELines } from '../lib/meetings/sseParser'

// ── Helper: simulate the full streaming loop over an array of raw chunks ──────

/**
 * Feed a sequence of raw string chunks through processSSELines and accumulate
 * all parsed events, exactly as AudioTranscriptionPanel does.
 *
 * @param {string[]} chunks - Array of raw string values (as if from TextDecoder.decode)
 * @returns {{ events: Array<any>, finalBuffer: string }}
 */
function simulateStream(chunks) {
  let buffer = ''
  const events = []

  for (const chunk of chunks) {
    const { updatedBuffer, events: newEvents } = processSSELines(buffer, chunk)
    buffer = updatedBuffer
    events.push(...newEvents)
  }

  // Flush remaining buffer (mirrors the "final buffer" logic in the panel)
  const remaining = buffer.trim()
  if (remaining.startsWith('data: ')) {
    try {
      events.push(JSON.parse(remaining.slice(6)))
    } catch { /* malformed — ignore in flush */ }
  }

  return { events, finalBuffer: buffer }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('processSSELines — basic parsing', () => {
  test('done event arrives in a single chunk', () => {
    const chunk = 'data: {"done":true,"summary":"All good"}\n'
    const { events, finalBuffer } = simulateStream([chunk])

    expect(events).toHaveLength(1)
    expect(events[0].done).toBe(true)
    expect(events[0].summary).toBe('All good')
    expect(finalBuffer).toBe('')
  })

  test('non-SSE lines are silently ignored', () => {
    const chunk = 'event: message\ndata: {"text":"hello"}\n\n'
    const { events } = simulateStream([chunk])

    expect(events).toHaveLength(1)
    expect(events[0].text).toBe('hello')
  })

  test('multiple events in one chunk are all parsed', () => {
    const chunk = 'data: {"text":"part1"}\ndata: {"text":"part2"}\ndata: {"done":true}\n'
    const { events } = simulateStream([chunk])

    expect(events).toHaveLength(3)
    expect(events[0].text).toBe('part1')
    expect(events[1].text).toBe('part2')
    expect(events[2].done).toBe(true)
  })
})

describe('processSSELines — chunk boundary handling', () => {
  test('done event split across two chunks at the \\n boundary', () => {
    // First chunk ends exactly after the JSON, before the newline
    const chunk1 = 'data: {"done":true,"summary":"Split"}'
    // Second chunk starts with the newline that terminates the line
    const chunk2 = '\n'

    const { events } = simulateStream([chunk1, chunk2])

    expect(events).toHaveLength(1)
    expect(events[0].done).toBe(true)
    expect(events[0].summary).toBe('Split')
  })

  test('done event split mid-JSON across two chunks', () => {
    // Chunk boundary falls inside the JSON value
    const full = 'data: {"done":true,"summary":"MidSplit"}\n'
    const splitAt = Math.floor(full.length / 2)
    const chunk1 = full.slice(0, splitAt)
    const chunk2 = full.slice(splitAt)

    const { events } = simulateStream([chunk1, chunk2])

    expect(events).toHaveLength(1)
    expect(events[0].done).toBe(true)
    expect(events[0].summary).toBe('MidSplit')
  })

  test('incremental text events accumulate correctly across many chunks', () => {
    // Simulate streaming JSON built up across 3 text events + done
    const chunks = [
      'data: {"text":"Hello "}\n',
      'data: {"text":"world'  ,  // mid-chunk — no newline yet
      '"}\ndata: {"text":"!"}\n',
      'data: {"done":true}\n',
    ]
    const { events } = simulateStream(chunks)
    const textEvents = events.filter((e) => e.text)
    const doneEvent = events.find((e) => e.done)

    const fullText = textEvents.map((e) => e.text).join('')
    expect(fullText).toBe('Hello world!')
    expect(doneEvent).toBeDefined()
  })
})

describe('processSSELines — error handling', () => {
  test('malformed JSON in an SSE line logs an error and does not crash', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const chunks = [
      'data: {BROKEN JSON}\n',         // malformed
      'data: {"done":true}\n',          // valid — loop should still see this
    ]
    const { events } = simulateStream(chunks)

    // Should still parse the valid line
    expect(events).toHaveLength(1)
    expect(events[0].done).toBe(true)

    // Should have logged the error
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[sseParser] SSE parse error:'),
      expect.any(String),
      expect.objectContaining({ line: 'data: {BROKEN JSON}' })
    )

    consoleSpy.mockRestore()
  })

  test('stream closes without a done event — returns empty event list', () => {
    // Simulate a stream that sends only text events and then closes
    const chunks = [
      'data: {"text":"partial output"}\n',
    ]
    const { events } = simulateStream(chunks)
    const doneEvent = events.find((e) => e.done)

    expect(doneEvent).toBeUndefined()
    // Caller should detect missing done and handle it (null return / warning)
    // Here we just verify the helper itself doesn't throw
    expect(events).toHaveLength(1)
    expect(events[0].text).toBe('partial output')
  })

  test('completely empty stream produces no events', () => {
    const { events, finalBuffer } = simulateStream([])
    expect(events).toHaveLength(0)
    expect(finalBuffer).toBe('')
  })
})

describe('processSSELines — buffer state', () => {
  test('updatedBuffer retains partial line when chunk has no trailing newline', () => {
    const { updatedBuffer } = processSSELines('', 'data: {"partial":')
    expect(updatedBuffer).toBe('data: {"partial":')
  })

  test('updatedBuffer is empty when chunk ends with newline', () => {
    const { updatedBuffer } = processSSELines('', 'data: {"done":true}\n')
    expect(updatedBuffer).toBe('')
  })

  test('carry-over from prior buffer is correctly prepended', () => {
    // First call leaves a partial line
    const { updatedBuffer: buf1 } = processSSELines('', 'data: {"tex')
    expect(buf1).toBe('data: {"tex')

    // Second call completes the line
    const { updatedBuffer: buf2, events } = processSSELines(buf1, 't":"hi"}\n')
    expect(buf2).toBe('')
    expect(events).toHaveLength(1)
    expect(events[0].text).toBe('hi')
  })
})
