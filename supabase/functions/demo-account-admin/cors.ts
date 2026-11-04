export const PRODUCTION_ORIGIN = 'https://inroads.alertdriving.com'

/** Header names the browser may send. Values are never copied into the response. */
export const ALLOWED_REQUEST_HEADERS = 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage'

export const ALLOWED_METHODS = 'POST, OPTIONS'

const LOOPBACK_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::(\d{1,5}))?$/

export interface DemoAdminCorsOptions {
  /** Comma-separated loopback origins. Any other value is ignored. */
  localOrigins?: string
}

function isLoopbackOrigin(origin: string): boolean {
  const match = LOOPBACK_ORIGIN.exec(origin)
  if (!match) return false
  if (match[1] === undefined) return true
  const port = Number(match[1])
  return port >= 1 && port <= 65535
}

/**
 * Production is always allowed. Loopback origins are added only from an
 * explicit configuration string. Wildcards and other hosts are ignored.
 */
export function demoAdminAllowedOrigins(localOrigins?: string): ReadonlySet<string> {
  const allowed = new Set<string>([PRODUCTION_ORIGIN])
  if (!localOrigins) return allowed
  for (const part of localOrigins.split(',')) {
    const origin = part.trim()
    if (isLoopbackOrigin(origin)) allowed.add(origin)
  }
  return allowed
}

export function corsHeadersFor(request: Request, allowed: ReadonlySet<string>): Headers {
  const headers = new Headers()
  headers.set('Vary', 'Origin')
  const origin = request.headers.get('Origin')
  if (origin && allowed.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS)
    headers.set('Access-Control-Allow-Headers', ALLOWED_REQUEST_HEADERS)
  }
  return headers
}

export function withCors(response: Response, cors: Headers): Response {
  const headers = new Headers(response.headers)
  cors.forEach((value, key) => headers.set(key, value))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
