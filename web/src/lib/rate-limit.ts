// In-memory limiter for login attempts. One web process serves the hospital,
// so a process-local map is enough; it resets on restart.

const WINDOW_MS = 15 * 60 * 1000;
// Per account and per trusted IP. An IP serves many accounts, so it gets more.
const MAX_ATTEMPTS = 5;
const MAX_ATTEMPTS_IP = 20;

const attempts = new Map<string, number[]>();

export function isRateLimited(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, recent);
  return recent.length >= (key.startsWith("ip:") ? MAX_ATTEMPTS_IP : MAX_ATTEMPTS);
}

export function recordFailure(key: string, now = Date.now()) {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
}

/** One failed attempt, counted against every key at once. */
export function recordFailures(keys: string[], now = Date.now()) {
  for (const key of keys) recordFailure(key, now);
}

export function clearFailures(key: string) {
  attempts.delete(key);
}
