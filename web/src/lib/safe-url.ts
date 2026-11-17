// Small guards for values that come straight from the URL.

/**
 * Where to go after login: only a path on this site. Rejects "//host",
 * "/\host" (browsers read the backslash as a slash) and anything that would
 * resolve to another origin.
 */
export function safeNextPath(raw: string | null | undefined, origin = "http://diktomed.invalid"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  try {
    const url = new URL(raw, origin);
    if (url.origin !== new URL(origin).origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
