const ACTIVITY_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createId(): string {
  return crypto.randomUUID()
}

/** True when a value can be sent to a Postgres uuid column. */
export function isActivityUuid(value: unknown): value is string {
  return typeof value === 'string' && ACTIVITY_UUID.test(value.trim())
}

/** Trimmed uuid, or an empty string when the value cannot be queried. */
export function canonicalActivityId(value: unknown): string {
  return isActivityUuid(value) ? value.trim() : ''
}

export function nowIso(): string {
  return new Date().toISOString()
}
