/**
 * Shared retry + rate-limit utilities for API calls.
 *
 * Used by the composite pipeline to prevent Gemini 429 cascades
 * and isolate per-item failures so one bad item doesn't nuke the batch.
 */

/** Options for retryFetch */
interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 2000) */
  baseDelayMs?: number;
  /** HTTP status codes that should trigger a retry (default: [429, 500, 502, 503, 504]) */
  retryOnStatus?: number[];
  /** Abort signal to cancel the request */
  signal?: AbortSignal;
}

/**
 * Fetch wrapper with exponential backoff retry on rate-limit and server errors.
 *
 * Retries on 429 (rate limit), 500, 502, 503, 504 by default.
 * Uses exponential backoff: delay = baseDelay * 2^attempt + jitter.
 *
 * Returns the Response on success (2xx or non-retryable status).
 * Throws only if all retries are exhausted or the request is aborted.
 */
export async function retryFetch(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelayMs = 2000,
    retryOnStatus = [429, 500, 502, 503, 504],
    signal,
  } = opts;

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      const res = await fetch(url, { ...init, signal });

      // Success or non-retryable error — return immediately
      if (res.ok || !retryOnStatus.includes(res.status)) {
        return res;
      }

      // Retryable error — save response for potential final return
      lastResponse = res;

      // Check for Retry-After header (Gemini sometimes sends this)
      const retryAfter = res.headers.get("Retry-After");
      let delay: number;
      if (retryAfter) {
        const parsed = parseInt(retryAfter, 10);
        delay = Number.isFinite(parsed) ? parsed * 1000 : baseDelayMs * Math.pow(2, attempt);
      } else {
        delay = baseDelayMs * Math.pow(2, attempt);
      }

      // Add jitter (0-25% of delay) to prevent thundering herd
      delay += Math.random() * delay * 0.25;

      if (attempt < maxRetries) {
        await sleep(delay, signal);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        await sleep(delay, signal);
      }
    }
  }

  // All retries exhausted
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("All retries exhausted");
}

/**
 * Concurrency-limited pool executor.
 *
 * Runs `tasks` with at most `concurrency` workers at a time.
 * Each task receives its index. Results are returned in order.
 * Failed tasks return { error } instead of throwing.
 */
export async function poolExecute<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<({ ok: true; value: T } | { ok: false; error: string })[]> {
  const results: ({ ok: true; value: T } | { ok: false; error: string })[] = new Array(tasks.length);
  let nextIndex = 0;
  let doneCount = 0;

  const worker = async () => {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        const value = await tasks[idx]();
        results[idx] = { ok: true, value };
      } catch (err) {
        results[idx] = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      doneCount++;
      onProgress?.(doneCount, tasks.length);
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

/** Sleep that respects an AbortSignal */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
