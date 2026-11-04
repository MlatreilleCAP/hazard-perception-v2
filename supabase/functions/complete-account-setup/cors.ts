export const PRODUCTION_ORIGIN = 'https://inroads.alertdriving.com'
export const ALLOWED_REQUEST_HEADERS = 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage'
export const ALLOWED_METHODS = 'POST, OPTIONS'

const LOOPBACK_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::(\d{1,5}))?$/

export function allowedOrigins(localOrigins?: string): ReadonlySet<string> {
  const allowed = new Set<string>([PRODUCTION_ORIGIN])
  if (!localOrigins) return allowed
  for (const part of localOrigins.split(',')) {
    const origin = part.trim()
    const match = LOOPBACK_ORIGIN.exec(origin)
    if (!match) continue
    if (match[1] === undefined || (Number(match[1]) >= 1 && Number(match[1]) <= 65535)) allowed.add(origin)
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
