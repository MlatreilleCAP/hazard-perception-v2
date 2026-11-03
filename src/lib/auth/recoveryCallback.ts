export const RECOVERY_LINK_ERROR = 'This reset link is invalid or has expired.'
export const RECOVERY_NETWORK_ERROR =
  'Could not verify this reset link. Check your connection and try again.'

export type RecoveryCallback =
  | { kind: 'code'; code: string }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'hash'; accessToken: string; refreshToken: string }
  | { kind: 'error' }
  | { kind: 'none' }

/**
 * Reads the callback Supabase Auth appends after a recovery email is verified.
 * PKCE returns `?code=`. The implicit grant returns `#access_token` and
 * `type=recovery`. A direct token-hash link uses `?token_hash` and `type=recovery`.
 */
export function readRecoveryCallback(href: string): RecoveryCallback {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { kind: 'none' }
  }

  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
  const type = (query.get('type') || hash.get('type') || '').trim()

  if (
    query.get('error') ||
    query.get('error_code') ||
    query.get('error_description') ||
    hash.get('error') ||
    hash.get('error_code') ||
    hash.get('error_description')
  ) {
    return { kind: 'error' }
  }

  const code = query.get('code')?.trim() ?? ''
  if (code) return { kind: 'code', code }

  const tokenHash = query.get('token_hash')?.trim() ?? ''
  if (tokenHash && type === 'recovery') return { kind: 'token_hash', tokenHash }

  const accessToken = hash.get('access_token')?.trim() ?? ''
  const refreshToken = hash.get('refresh_token')?.trim() ?? ''
  if (accessToken && refreshToken && type === 'recovery') {
    return { kind: 'hash', accessToken, refreshToken }
  }

  return { kind: 'none' }
}
