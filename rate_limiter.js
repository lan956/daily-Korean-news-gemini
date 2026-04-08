/**
 * rate_limiter.js
 * Sliding-window rate limiter for Gemini's free-tier API constraints:
 *   - 5 requests / minute  (RPM)
 *   - 20 requests / day    (RPD)
 *   - 250 000 tokens / minute (TPM — so generous we don't need to track it)
 *
 * Call `await rateLimiter.acquire()` before every Gemini request.
 * Call `rateLimiter.record()` after the response arrives.
 */

const WINDOW_MS    = 60_000;
const MAX_RPM      = 4;     // keep 1 in reserve (limit is 5)
const MAX_RPD      = 18;    // keep 2 in reserve (limit is 20)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class RateLimiter {
  constructor() {
    this._windowStart  = Date.now();
    this._dayStart     = Date.now();
    this._requestsMin  = 0;
    this._requestsDay  = 0;
  }

  _resetMinuteIfExpired() {
    if (Date.now() - this._windowStart >= WINDOW_MS) {
      this._windowStart = Date.now();
      this._requestsMin = 0;
    }
  }

  /**
   * Block until there is capacity for 1 request.
   */
  async acquire() {
    this._resetMinuteIfExpired();

    // Check daily limit
    if (this._requestsDay >= MAX_RPD) {
      console.error(
        `[rate_limiter] Daily request limit reached (${this._requestsDay}/${MAX_RPD}). ` +
        `Cannot proceed — would exceed Gemini free tier RPD.`
      );
      throw new Error("Gemini free tier daily request limit reached");
    }

    // Check per-minute limit
    if (this._requestsMin >= MAX_RPM) {
      const elapsed = Date.now() - this._windowStart;
      const waitMs  = WINDOW_MS - elapsed + 1000; // +1s safety margin
      console.log(
        `[rate_limiter] RPM cap reached (${this._requestsMin}/${MAX_RPM}) — ` +
        `waiting ${Math.ceil(waitMs / 1000)}s for window reset …`
      );
      await sleep(waitMs);
      this._windowStart = Date.now();
      this._requestsMin = 0;
    }

    // Reserve the slot
    this._requestsMin += 1;
    this._requestsDay += 1;
  }

  /**
   * Record that a request completed successfully.
   * (Currently a no-op since we pre-increment in acquire, but kept for symmetry)
   */
  record() {
    // Slots already reserved in acquire()
  }

  status() {
    this._resetMinuteIfExpired();
    return {
      requestsThisMinute: this._requestsMin,
      requestsToday:      this._requestsDay,
      minuteWindowAgeMs:  Date.now() - this._windowStart,
    };
  }
}

export { RateLimiter };
export const rateLimiter = new RateLimiter();
