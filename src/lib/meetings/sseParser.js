/**
 * Pure SSE line-buffering helper for the extract-meeting-data stream.
 *
 * Exported as a standalone module so it can be unit-tested without a real
 * ReadableStream or any DOM / Supabase dependency.
 *
 * Handles:
 * - Line endings: both LF (\n) and CRLF (\r\n)
 * - Malformed events: skipped with detailed logging (see comment below)
 * - Unbounded buffer growth: maximum size safeguard to prevent OOM
 */

const MAX_BUFFER_SIZE = 524_288; // 512 KB — reasonable for streaming chunks without finding \n

/**
 * Process a new raw chunk into the ongoing SSE buffer.
 *
 * @param {string} buffer   - Carry-over from the previous read() call (may be empty).
 * @param {string} newChunk - Raw decoded text from the current read() call.
 * @returns {{ updatedBuffer: string, events: Array<any>, error?: string }}
 *   updatedBuffer: the partial line that could not yet be terminated (keep for next call).
 *   events: every successfully parsed SSE event object from complete lines in this batch.
 *   error: non-null if buffer overflow occurred (stream is likely corrupted).
 */
export function processSSELines(buffer, newChunk) {
  const combined = buffer + newChunk;

  // Check for unbounded buffer growth: if no newline found and buffer is huge,
  // treat as stream corruption. Log the error and clear the buffer to prevent OOM.
  if (!combined.includes('\n') && combined.length > MAX_BUFFER_SIZE) {
    console.error(
      '[sseParser] Buffer overflow: no newline found in %d bytes (max %d). ' +
      'Clearing buffer and skipping this chunk. Stream may be corrupted.',
      combined.length,
      MAX_BUFFER_SIZE
    );
    return { updatedBuffer: '', events: [], error: 'buffer_overflow' };
  }

  // Split on either LF (\n) or CRLF (\r\n) to handle both line-ending styles.
  const lines = combined.split(/\r?\n/);

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
      // Malformed SSE event: skip it and log for debugging.
      // WHY SKIP (not retry): SSE streaming means the stream has already moved past
      // this line. Retrying makes no sense — the data is gone and the next chunk may
      // contain the next event. Dropping malformed events allows the stream to recover
      // and continue parsing valid events that follow. This is standard SSE behavior.
      console.error(
        '[sseParser] Skipping malformed SSE event (JSON parse error: %s). Raw line: %O',
        err.message,
        line
      );
    }
  }

  return { updatedBuffer, events };
}
