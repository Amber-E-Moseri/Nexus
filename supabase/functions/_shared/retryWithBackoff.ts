/**
 * withRetry — exponential backoff helper for Deno / Supabase Edge Functions.
 *
 * Retryable status codes: 429, 500, 502, 503, 504, and network errors.
 * Non-retryable:          400, 401, 403, 404 (caller should handle these).
 */

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

export interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  /** Optional label included in log lines to identify the call site. */
  label?: string
}

export class NonRetryableError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'NonRetryableError'
  }
}

export class MaxRetriesExceededError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly lastError: unknown,
  ) {
    super(`Max retries (${attempts}) exceeded. Last error: ${String(lastError)}`)
    this.name = 'MaxRetriesExceededError'
  }
}

/**
 * Wraps `fn` with exponential backoff retry logic.
 *
 * The `fn` callback should throw a `NonRetryableError` for auth/bad-request
 * failures so the retry loop exits immediately. For HTTP wrappers, use the
 * `throwIfNonRetryable` helper below before passing the response to the caller.
 *
 * Backoff formula: min(baseDelayMs * 2^attempt, maxDelayMs) + jitter (±10%)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, label = 'withRetry' } = options
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      // Never retry auth/client errors — surface immediately
      if (err instanceof NonRetryableError) {
        console.error(`[${label}] Non-retryable error (HTTP ${err.statusCode}): ${err.message}`)
        throw err
      }

      lastError = err

      if (attempt === maxRetries) break

      const base = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      // ±10% jitter to avoid thundering herd
      const jitter = base * 0.1 * (Math.random() * 2 - 1)
      const delay = Math.round(base + jitter)

      console.warn(
        `[${label}] Attempt ${attempt + 1}/${maxRetries} failed — ` +
        `retrying in ${delay}ms. Error: ${String(err)}`
      )

      await sleep(delay)
    }
  }

  throw new MaxRetriesExceededError(maxRetries + 1, lastError)
}

/**
 * Inspect a fetch Response and throw the appropriate error type so
 * `withRetry` knows whether to retry.
 *
 * Usage:
 *   const res = await fetch(url, opts)
 *   throwIfNonRetryable(res)   // throws NonRetryableError for 4xx
 *   throwIfRetryable(res)      // throws plain Error for 5xx/429 (triggers retry)
 */
export function throwIfErrorResponse(res: Response, bodyText?: string): void {
  if (res.ok) return

  const msg = bodyText ? `HTTP ${res.status}: ${bodyText}` : `HTTP ${res.status}`

  // These codes mean "bad credentials or request" — retry won't help
  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
    throw new NonRetryableError(res.status, msg)
  }

  // For retryable codes throw a plain Error — withRetry will catch and retry
  if (RETRYABLE_STATUS_CODES.has(res.status)) {
    throw new Error(msg)
  }

  // Unknown non-2xx — treat as non-retryable to avoid infinite loops
  throw new NonRetryableError(res.status, msg)
}

// ── Default retry profile for Google Calendar API calls ──────────────────────

export const GCAL_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 4,
  baseDelayMs: 2_000,   // 2s → 4s → 8s → 16s (capped at 5 min)
  maxDelayMs: 300_000,  // 5 minutes
  label: 'gcal',
}

// ── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
