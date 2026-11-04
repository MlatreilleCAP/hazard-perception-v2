export type SetupMetadata = {
  setup_required?: unknown
  sessions_valid_after?: unknown
  [key: string]: unknown
}

export function setupRequired(metadata: SetupMetadata | null | undefined): boolean {
  return metadata?.setup_required === true
}

export function accessTokenIssuedAt(accessToken: string | null | undefined): number | null {
  const payload = accessToken?.split('.')[1]
  if (!payload) return null
  try {
    const base64 = payload.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const parsed: unknown = JSON.parse(atob(padded))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const issuedAt = (parsed as { iat?: unknown }).iat
    return typeof issuedAt === 'number' ? issuedAt : null
  } catch {
    return null
  }
}

/**
 * The cutoff is the setup token's iat. That token and any other token from
 * the same second stay closed. A sign-in in the next second is eligible.
 */
export function sessionPredatesSetup(
  metadata: SetupMetadata | null | undefined,
  accessToken: string | null | undefined,
): boolean {
  const cutoff = metadata?.sessions_valid_after
  if (typeof cutoff !== 'number') return false
  const issuedAt = accessTokenIssuedAt(accessToken)
  if (issuedAt == null) return true
  return issuedAt <= cutoff
}

export function setupPathAllowed(path: string): boolean {
  return path === '/setup-account'
    || path === '/reset-password'
    || path === '/login'
    || path === '/auth/callback'
}

export function playerMayLoadContent(
  metadata: SetupMetadata | null | undefined,
  accessToken: string | null | undefined,
): boolean {
  return !setupRequired(metadata) && !sessionPredatesSetup(metadata, accessToken)
}
