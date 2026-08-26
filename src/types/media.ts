/**
 * Media is referenced by id in Activity Definition JSON.
 * Runtime resolves a private Storage object to a short-lived signed URL.
 */
export interface MediaRef {
  media_asset_id: string
}

export interface MediaAsset {
  id: string
  activityId: string | null
  bucket: 'activity-media'
  path: string
  mimeType: string
  sizeBytes: number | null
  durationMs: number | null
  createdBy: string | null
  createdAt: string
}

export const ACTIVITY_MEDIA_BUCKET = 'activity-media' as const

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
