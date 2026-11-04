import { DispatchError } from './errors.ts'

export const MAX_ATTEMPTS = 5
export const MAX_BATCH = 20
export const MAX_DURATION_MS = 20_000
export const CLAIM_LEASE = '2 minutes'
export const BASE_BACKOFF_MS = 30_000
export const MAX_BACKOFF_MS = 15 * 60_000

export function clampBatchSize(requested: number | null): number {
  if (requested == null || !Number.isInteger(requested) || requested < 1) return 10
  return Math.min(requested, MAX_BATCH)
}

export function backoffMs(attemptCount: number): number {
  const exponent = Math.max(0, attemptCount - 1)
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent)
}

export function failureDisposition(
  attemptCount: number,
  retryable: boolean,
): 'pending' | 'failed' {
  if (!retryable || attemptCount >= MAX_ATTEMPTS) return 'failed'
  return 'pending'
}

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

export function authorizeDispatch(authorization: string | null, expectedSecret: string | undefined): void {
  const expected = expectedSecret?.trim() ?? ''
  if (!expected) throw new DispatchError(500, 'config', 'Email dispatch is not configured.')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
  if (!token || !secretsMatch(token, expected)) {
    throw new DispatchError(401, 'unauthorized', 'Email dispatch was not authorized.')
  }
}
