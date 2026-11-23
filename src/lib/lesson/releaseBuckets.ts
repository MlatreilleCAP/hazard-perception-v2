export const RELEASE_BUCKETS_SETTING_KEY = 'queue_release_buckets'
export const RELEASE_BUCKETS_STORAGE_KEY = 'hp.queueReleaseBuckets'

export type ReleaseBucket = {
  id: string
  name: string
  /** Calendar date in YYYY-MM-DD. */
  releaseDate: string
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function readReleaseBucketId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function readReleaseDate(value: unknown): string {
  if (typeof value !== 'string' || !DATE.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return ''
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return ''
  }
  return value
}

export function formatReleaseDate(iso: string): string {
  const releaseDate = readReleaseDate(iso)
  if (!releaseDate) return ''
  const [year, month, day] = releaseDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)))
}

export function sortReleaseBuckets(buckets: readonly ReleaseBucket[]): ReleaseBucket[] {
  return [...buckets].sort((left, right) => {
    const byDate = left.releaseDate.localeCompare(right.releaseDate)
    if (byDate !== 0) return byDate
    return left.name.localeCompare(right.name)
  })
}

export function readReleaseBuckets(value: unknown): ReleaseBucket[] {
  const raw =
    value && typeof value === 'object' && 'buckets' in value
      ? (value as { buckets?: unknown }).buckets
      : value
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const buckets: ReleaseBucket[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const releaseDate = readReleaseDate(record.releaseDate)
    if (!id || !name || !releaseDate || seen.has(id)) continue
    seen.add(id)
    buckets.push({ id, name, releaseDate })
  }
  return sortReleaseBuckets(buckets)
}

export type ReleaseBucketSection<T> = {
  bucket: ReleaseBucket | null
  cards: T[]
}

/** Unscheduled first, then each release in date order. Empty sections stay so activities can be moved between them. */
export function groupByReleaseBucket<T extends { releaseBucketId: string }>(
  cards: readonly T[],
  buckets: readonly ReleaseBucket[],
): ReleaseBucketSection<T>[] {
  const ordered = sortReleaseBuckets(buckets)
  const known = new Set(ordered.map((bucket) => bucket.id))
  const unscheduled: T[] = []
  const byId = new Map<string, T[]>()
  for (const card of cards) {
    if (card.releaseBucketId && known.has(card.releaseBucketId)) {
      const list = byId.get(card.releaseBucketId) ?? []
      list.push(card)
      byId.set(card.releaseBucketId, list)
    } else {
      unscheduled.push(card)
    }
  }
  const sections: ReleaseBucketSection<T>[] = []
  if (unscheduled.length > 0 || ordered.length > 0) {
    sections.push({ bucket: null, cards: unscheduled })
  }
  for (const bucket of ordered) {
    sections.push({ bucket, cards: byId.get(bucket.id) ?? [] })
  }
  return sections
}
