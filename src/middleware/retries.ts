import type { Middleware } from "../types.js"
import { sendTelemetry } from "../telemetry/send.js"

export interface RetriesOptions {
  /** Max attempts total, including the first -- max: 3 means up to 2 retries. Default 3. */
  max?: number
  backoff?: "exponential" | "fixed"
  /** Base delay in ms for the first retry. Default 500. */
  baseDelayMs?: number
  /** Cap so exponential backoff can't grow unbounded. Default 10000. */
  maxDelayMs?: number
  /**
   * Which errors are worth retrying. Defaults to HTTP 429/500/502/503/504 --
   * the classic transient-failure set every LLM provider actually returns
   * for rate limits and momentary outages. A 400 (bad request) or 401
   * (auth) retrying 3 times would just burn the developer's rate limit
   * budget on a call that was never going to succeed.
   */
  isRetryable?: (error: unknown) => boolean
}

function defaultIsRetryable(error: unknown): boolean {
  const status = (error as { status?: number; statusCode?: number })?.status
    ?? (error as { statusCode?: number })?.statusCode
  if (typeof status === "number") return status === 429 || (status >= 500 && status < 600)
  // Network-level errors (no HTTP status at all) are almost always transient.
  const code = (error as { code?: string })?.code
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED"
}

function delayFor(attempt: number, opts: Required<Pick<RetriesOptions, "backoff" | "baseDelayMs" | "maxDelayMs">>): number {
  const base = opts.backoff === "fixed" ? opts.baseDelayMs : opts.baseDelayMs * 2 ** (attempt - 1)
  const capped = Math.min(base, opts.maxDelayMs)
  // Full jitter (AWS's recommended strategy): random between 0 and the
  // capped delay, not just +/- a percentage -- prevents every retrying
  // client from synchronizing on the same retry instant after a shared
  // outage (the "thundering herd" problem a fixed backoff doesn't solve).
  return Math.random() * capped
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function retries(options: RetriesOptions = {}): Middleware {
  sendTelemetry("middleware_retry_enabled")
  const max = options.max ?? 3
  const backoff = options.backoff ?? "exponential"
  const baseDelayMs = options.baseDelayMs ?? 500
  const maxDelayMs = options.maxDelayMs ?? 10000
  const isRetryable = options.isRetryable ?? defaultIsRetryable

  return async (args, next, ctx) => {
    let lastError: unknown
    for (let attempt = 1; attempt <= max; attempt++) {
      ctx.attempt = attempt
      try {
        return await next(args)
      } catch (error) {
        lastError = error
        const isLastAttempt = attempt === max
        if (isLastAttempt || !isRetryable(error)) throw error
        await sleep(delayFor(attempt, { backoff, baseDelayMs, maxDelayMs }))
      }
    }
    // Unreachable given the loop above always either returns or throws,
    // but TypeScript can't see that -- satisfies the return type honestly
    // instead of an `as never` cast that would hide a real bug if the loop
    // logic above ever changes.
    throw lastError
  }
}
