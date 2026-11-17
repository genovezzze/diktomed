// The address the browser actually used. Behind Docker the server only knows
// its bind address (0.0.0.0), so request.url cannot be used for redirects;
// the Host header (or a reverse proxy's X-Forwarded-*) can.
export function browserUrl(path: string, headers: Headers, fallback: string): URL {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? new URL(fallback).protocol.replace(":", "");
  return new URL(path, host ? `${proto}://${host}` : fallback);
}
