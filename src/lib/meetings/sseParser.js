/**
 * Pure SSE line-buffering helper for the extract-meeting-data stream.
 *
 * Exported as a standalone module so it can be unit-tested without a real
 * ReadableStream or any DOM / Supabase dependency.
 */

/**
 * Process a new raw chunk into the ongoing SSE buffer.
 *
 * @param {string} buffer   - Carry-over from the previous read() call (may be empty).
 * @param {string} newChunk - Raw decoded text from the current read() call.
 * @returns {{ updatedBuffer: string, events: Array<any> }}
 *   updatedBuffer: the partial line that could not yet be terminated (keep for next call).
 *   events: every successfully parsed SSE event object from complete lines in this batch.
 */
export function processSSELines(buffer, newChunk) {
  const combined = buffer + newChunk;
  const lines = combined.split('\n');

  // The last element is either '' (line was complete) or a partial line without \n yet.
  // Either way it belongs in the next call's buffer.
  const updatedBuffer = lines.pop() ?? '';

  const events = [];
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const event = JSON.parse(line.slice(6));
      events.push(event);
    } catch (err) {
      console.error('[sseParser] SSE parse error:', err.message, { line });
    }
  }

  return { updatedBuffer, events };
}
