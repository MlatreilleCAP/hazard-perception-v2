const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SetupSessionClaim {
  iat: number
  sessionId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads iat and session_id from the bearer token already accepted by Auth. */
export function sessionClaimFromAuthorization(authorization: string | null): SetupSessionClaim | null {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim() ?? ''
  const payload = token.split('.')[1]
  if (!payload || token.split('.').length < 2) return null
  try {
    const base64 = payload.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const parsed: unknown = JSON.parse(atob(padded))
    if (!isRecord(parsed)) return null
    const issuedAt = parsed.iat
    const sessionId = parsed.session_id
    if (typeof issuedAt !== 'number' || !Number.isSafeInteger(issuedAt) || issuedAt < 0) return null
    if (typeof sessionId !== 'string' || !UUID.test(sessionId)) return null
    return { iat: issuedAt, sessionId: sessionId.toLowerCase() }
  } catch {
    return null
  }
}
