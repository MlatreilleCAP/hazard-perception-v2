/**
 * Media is referenced by id in Activity Definition JSON.
 * Runtime resolves a private Storage object to a short-lived signed URL.
 */
export interface MediaRef {
  media_asset_id: string
}

export const MEDIA_CLIP_META_FIELDS = [
  { key: 'timeOfDay', label: 'Time of Day', aliases: ['time_of_day'] },
  { key: 'maneuver', label: 'Maneuver', aliases: ['maneuver'] },
  { key: 'roadway', label: 'Roadway', aliases: ['roadway'] },
  { key: 'trafficDensity', label: 'Traffic Density', aliases: ['traffic_density'] },
  { key: 'roadConditions', label: 'Road Conditions', aliases: ['road_conditions'] },
  { key: 'country', label: 'Country', aliases: ['country'] },
  { key: 'vehicleType', label: 'Vehicle Type', aliases: ['vehicle_type'] },
  { key: 'lever', label: 'Lever', aliases: ['lever'] },
  { key: 'hazardName', label: 'Hazard Name', aliases: ['hazard_name'] },
  { key: 'coreCompetency', label: 'Core Competency', aliases: ['core_competency'] },
  { key: 'hazardExplanation', label: 'Hazard Explanation', aliases: ['hazard_explanation'] },
] as const

export const MEDIA_CLIP_REQUIRED_KEYS = [
  'timeOfDay',
  'maneuver',
  'roadway',
  'trafficDensity',
  'roadConditions',
] as const

export type MediaClipMetaKey = (typeof MEDIA_CLIP_META_FIELDS)[number]['key']

export type MediaClipMetaRow = {
  name: string
  text: string
}

export type MediaClipMetadata = Record<MediaClipMetaKey, string> & {
  rows: MediaClipMetaRow[]
}

function normalizeMetaAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function emptyMediaClipMetadata(): MediaClipMetadata {
  return {
    timeOfDay: '',
    maneuver: '',
    roadway: '',
    trafficDensity: '',
    roadConditions: '',
    country: '',
    vehicleType: '',
    lever: '',
    hazardName: '',
    coreCompetency: '',
    hazardExplanation: '',
    rows: [],
  }
}

function readMetaRows(value: unknown): MediaClipMetaRow[] {
  if (!Array.isArray(value)) return []
  const rows: MediaClipMetaRow[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : ''
    const text = typeof record.text === 'string' ? record.text : ''
    if (!name.trim() && !text.trim()) continue
    rows.push({ name, text })
  }
  return rows
}

export function parseMediaClipMetadata(value: unknown): MediaClipMetadata {
  const next = emptyMediaClipMetadata()
  let parsed: unknown = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      return next
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return next
  const record = parsed as Record<string, unknown>
  const lookup = new Map<string, string>()

  next.rows = readMetaRows(record.rows)
  for (const [rawKey, rawValue] of Object.entries(record)) {
    if (rawKey === 'rows' || typeof rawValue !== 'string') continue
    lookup.set(normalizeMetaAlias(rawKey), rawValue)
    if (next.rows.length === 0 && rawValue.trim()) {
      const known = MEDIA_CLIP_META_FIELDS.find(
        (field) =>
          field.key === rawKey ||
          field.aliases.some((alias) => normalizeMetaAlias(alias) === normalizeMetaAlias(rawKey)),
      )
      next.rows.push({ name: known?.label ?? rawKey, text: rawValue })
    }
  }
  for (const row of next.rows) {
    if (row.text.trim()) lookup.set(normalizeMetaAlias(row.name), row.text)
  }
  for (const field of MEDIA_CLIP_META_FIELDS) {
    const aliases = [field.key, ...field.aliases].map(normalizeMetaAlias)
    const match = aliases.map((alias) => lookup.get(alias)).find((text) => text != null)
    if (match != null) next[field.key] = match
  }
  return next
}

export const DEFAULT_MEDIA_META_NAME = 'metadata'
export const DEFAULT_MEDIA_META_TEXT = 'Empty'

export function mediaClipMetadataHasContent(meta: MediaClipMetadata): boolean {
  return (
    meta.rows.some((row) => {
      const name = row.name.trim()
      const text = row.text.trim()
      if (!name && !text) return false
      if (
        name.toLowerCase() === DEFAULT_MEDIA_META_NAME &&
        (!text || text.toLowerCase() === DEFAULT_MEDIA_META_TEXT.toLowerCase())
      ) {
        return false
      }
      return true
    }) || MEDIA_CLIP_META_FIELDS.some((field) => meta[field.key].trim().length > 0)
  )
}

export function mediaClipMetadataPreviewRows(
  meta: MediaClipMetadata | null | undefined,
): MediaClipMetaRow[] {
  const fromSheet = (meta?.rows ?? []).filter((row) => row.name.trim() || row.text.trim())
  if (fromSheet.length > 0) {
    return fromSheet.map((row) => ({
      name: row.name.trim() || DEFAULT_MEDIA_META_NAME,
      text: row.text.trim() || DEFAULT_MEDIA_META_TEXT,
    }))
  }
  return [{ name: DEFAULT_MEDIA_META_NAME, text: DEFAULT_MEDIA_META_TEXT }]
}

export interface MediaAsset {
  id: string
  activityId: string | null
  bucket: 'activity-media'
  path: string
  mimeType: string
  sizeBytes: number | null
  durationMs: number | null
  widthPx: number | null
  heightPx: number | null
  /** Original client filename at upload time (for library labels). */
  originalFilename: string | null
  metadata: MediaClipMetadata
  createdBy: string | null
  createdAt: string
}

/** Label for media library lists: prefer original filename over storage key. */
export function mediaAssetDisplayName(asset: MediaAsset): string {
  const named = asset.originalFilename?.trim()
  if (named) return named
  const fromPath = asset.path.split('/').pop()?.trim()
  return fromPath || asset.id
}

export const ACTIVITY_MEDIA_BUCKET = 'activity-media' as const

/** Storage path prefix for files uploaded from the media library (no activity). */
export const LIBRARY_MEDIA_PATH_PREFIX = 'library' as const

/** Matches activity-media bucket limit in supabase/migrations (500 MiB). */
export const MAX_VIDEO_UPLOAD_BYTES = 524_288_000

/** Hazard explanation stills and other still images. */
export const MAX_IMAGE_UPLOAD_BYTES = 10_485_760

export function formatMediaSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mib = bytes / (1024 * 1024)
    return `${mib % 1 === 0 ? mib : mib.toFixed(1)} MB`
  }
  const kib = bytes / 1024
  return `${kib % 1 === 0 ? kib : kib.toFixed(1)} KB`
}

export function formatMediaDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatMediaDimensions(widthPx: number, heightPx: number): string {
  return `${widthPx} × ${heightPx}`
}

export function maxVideoUploadBytes(): number {
  const configured = import.meta.env.VITE_MAX_VIDEO_UPLOAD_BYTES
  if (typeof configured === 'string' && configured.trim()) {
    const parsed = Number.parseInt(configured, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return MAX_VIDEO_UPLOAD_BYTES
}

export function videoUploadSizeError(fileSizeBytes: number): string | null {
  const limit = maxVideoUploadBytes()
  if (fileSizeBytes <= limit) return null
  return `Video is ${formatMediaSize(fileSizeBytes)}. Maximum upload size is ${formatMediaSize(limit)}. Compress the file or raise the Storage limit in Supabase (global and activity-media bucket).`
}

export function imageUploadSizeError(fileSizeBytes: number): string | null {
  if (fileSizeBytes <= MAX_IMAGE_UPLOAD_BYTES) return null
  return `Image is ${formatMediaSize(fileSizeBytes)}. Maximum upload size is ${formatMediaSize(MAX_IMAGE_UPLOAD_BYTES)}.`
}

const PUBLIC_MEDIA_KEYS = new Set([
  'url',
  'src',
  'href',
  'publicUrl',
  'public_url',
  'mediaUrl',
  'streamUrl',
])

function scanForPublicUrls(
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanForPublicUrls(item, `${path}[${index}]`, errors)
    })
    return
  }

  if (value === null || typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  for (const [key, nested] of Object.entries(record)) {
    const nestedPath = `${path}.${key}`
    if (
      PUBLIC_MEDIA_KEYS.has(key) &&
      typeof nested === 'string' &&
      /^https?:\/\//i.test(nested)
    ) {
      errors.push(
        `Public media URL is not allowed at ${nestedPath}; use media_asset_id`,
      )
    }
    scanForPublicUrls(nested, nestedPath, errors)
  }
}

export function collectMediaAssetIds(value: unknown): string[] {
  const found = new Set<string>()

  const walk = (input: unknown): void => {
    if (Array.isArray(input)) {
      for (const item of input) walk(item)
      return
    }
    if (input === null || typeof input !== 'object') return
    const record = input as Record<string, unknown>
    if (typeof record.media_asset_id === 'string' && record.media_asset_id) {
      found.add(record.media_asset_id)
    }
    for (const nested of Object.values(record)) walk(nested)
  }

  walk(value)
  return [...found]
}

export function assertNoPublicMediaUrls(definition: {
  nodes: Array<{ id: string; config: unknown }>
  timeline: unknown
}): string[] {
  const errors: string[] = []
  for (const node of definition.nodes) {
    scanForPublicUrls(node.config, `nodes.${node.id}.config`, errors)
  }
  scanForPublicUrls(definition.timeline, 'timeline', errors)
  return errors
}
