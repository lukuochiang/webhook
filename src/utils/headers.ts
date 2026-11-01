/**
 * Header handling: serialization, redaction of sensitive headers, and parsing
 * of the configurable sensitive-header list.
 */

export const DEFAULT_SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
])

/** Parse a comma separated env value into a lower-cased set of header names. */
export function parseSensitiveHeaders(envValue?: string): Set<string> {
  const set = new Set<string>(DEFAULT_SENSITIVE_HEADERS)
  if (envValue) {
    for (const part of envValue.split(',')) {
      const trimmed = part.trim().toLowerCase()
      if (trimmed) set.add(trimmed)
    }
  }
  return set
}

/** Convert a Headers object into a plain record (multi-values joined with ", "). */
export function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key] = out[key] ? `${out[key]}, ${value}` : value
  })
  return out
}

/**
 * Return a copy of the headers with sensitive entries replaced by a redaction
 * marker. The input is never mutated.
 */
export function redactHeaders(
  headers: Record<string, string>,
  sensitive: Set<string>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key] = sensitive.has(key.toLowerCase()) ? '[REDACTED]' : value
  }
  return out
}
