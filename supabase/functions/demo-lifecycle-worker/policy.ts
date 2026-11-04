import { LifecycleWorkerError } from './errors.ts'

export function secretsMatch(provided: string, expected: string): boolean {
  const left = new TextEncoder().encode(provided)
  const right = new TextEncoder().encode(expected)
  const length = Math.max(left.length, right.length)
  let diff = left.length === right.length ? 0 : 1
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return diff === 0
}

export function authorizeLifecycleWorker(
  authorization: string | null,
  expectedSecret: string | undefined,
): void {
  const expected = expectedSecret?.trim() ?? ''
  if (!expected) throw new LifecycleWorkerError(500, 'Demo lifecycle processing is not configured.')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
  if (!token || !secretsMatch(token, expected)) {
    throw new LifecycleWorkerError(401, 'Demo lifecycle processing was not authorized.')
  }
}

export type AuthBanVerdict = 'banned' | 'clear' | 'unknown'

/** A missing or past banned_until is clear. An unparseable value is unknown. */
export function interpretAuthBan(
  bannedUntil: string | null | undefined,
  now = Date.now(),
): AuthBanVerdict {
  if (bannedUntil == null || bannedUntil.trim() === '') return 'clear'
  const until = Date.parse(bannedUntil)
  if (!Number.isFinite(until)) return 'unknown'
  return until > now ? 'banned' : 'clear'
}

export function authUserIsBanned(bannedUntil: string | null | undefined, now = Date.now()): boolean {
  return interpretAuthBan(bannedUntil, now) === 'banned'
}
