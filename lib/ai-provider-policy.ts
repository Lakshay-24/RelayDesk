export const MODEL_TIMEOUT_MS = 25_000;
export const DEFAULT_RETRY_DELAY_MS = 5_000;
export const MAX_RETRY_AFTER_MS = 10_000;

export const OPENROUTER_FREE_MODELS = [
  "openrouter/free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
] as const;

export const GEMINI_FREE_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;

export type FailedAttempt = {
  ok: false;
  reason: string;
  timedOut: boolean;
  status?: number;
  retryAfterMs?: number;
};

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfter(response: Response) {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(raw);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

export function isZeroQuota(result: FailedAttempt) {
  return result.status === 429 && /(?:limit\s*:\s*0|quota exceeded.*limit:\s*0|free[_ -]?tier.*limit:\s*0)/i.test(result.reason);
}

export function shouldStopProvider(result: FailedAttempt) {
  return result.status === 401 || result.status === 403 || isZeroQuota(result);
}

export function retryDelay(result: FailedAttempt) {
  if (shouldStopProvider(result) || result.status === 404) return null;
  if (result.status === 429) {
    const delay = result.retryAfterMs;
    return delay !== undefined && delay <= MAX_RETRY_AFTER_MS ? delay : null;
  }
  if (result.timedOut || result.status === undefined || result.status >= 500 || /empty|no .*text/i.test(result.reason)) {
    return DEFAULT_RETRY_DELAY_MS;
  }
  return null;
}
