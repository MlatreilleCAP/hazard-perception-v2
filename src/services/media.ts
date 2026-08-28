import { getSupabase } from '@/services/supabase'
import {
  ACTIVITY_MEDIA_BUCKET,
  collectMediaAssetIds,
  imageUploadSizeError,
  videoUploadSizeError,
  type MediaAsset,
} from '@/types/media'
import type { MediaAssetRow } from '@/types/database'
import type { ActivityDefinition } from '@/types/activity'

function mapAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    activityId: row.activity_id,
    bucket: ACTIVITY_MEDIA_BUCKET,
    path: row.path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationMs: row.duration_ms,
    widthPx: row.width_px ?? null,
    heightPx: row.height_px ?? null,
    originalFilename: row.original_filename ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export class MediaService {
  private signedUrlCache = new Map<string, { url: string; expiresAtMs: number }>()

  async getAsset(mediaAssetId: string): Promise<MediaAsset> {
    const client = requireClient()
    const { data, error } = await client
      .from('media_assets')
      .select('*')
      .eq('id', mediaAssetId)
      .single()

    if (error || !data) {
      throw new Error(`Media asset ${mediaAssetId} was not found`)
    }

    return mapAsset(data as MediaAssetRow)
  }

  async getSignedUrl(
    mediaAssetId: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const cached = this.signedUrlCache.get(mediaAssetId)
    // Reuse while at least 2 minutes of validity remain so preload URLs match playback.
    if (cached && cached.expiresAtMs - Date.now() > 120_000) {
      return cached.url
    }

    const client = requireClient()
    const asset = await this.getAsset(mediaAssetId)

    if (asset.bucket !== ACTIVITY_MEDIA_BUCKET) {
      throw new Error('Media asset is not in the private activity-media bucket')
    }

    const { data, error } = await client.storage
      .from(ACTIVITY_MEDIA_BUCKET)
      .createSignedUrl(asset.path, expiresInSeconds)

    if (error || !data?.signedUrl) {
      throw new Error(
        `Failed to create signed URL for media asset ${mediaAssetId}`,
      )
    }

    this.signedUrlCache.set(mediaAssetId, {
      url: data.signedUrl,
      expiresAtMs: Date.now() + expiresInSeconds * 1000,
    })
    return data.signedUrl
  }

  async resolveDefinitionMedia(
    definition: ActivityDefinition,
    expiresInSeconds = 3600,
  ): Promise<Record<string, string>> {
    const ids = collectMediaAssetIds(definition)
    const urls: Record<string, string> = {}
    for (const id of ids) {
      urls[id] = await this.getSignedUrl(id, expiresInSeconds)
    }
    return urls
  }

  async listVideoAssets(): Promise<MediaAsset[]> {
    return this.listAssetsByMime('video/%')
  }

  async listAudioAssets(): Promise<MediaAsset[]> {
    return this.listAssetsByMime('audio/%')
  }

  async listImageAssets(): Promise<MediaAsset[]> {
    return this.listAssetsByMime('image/%')
  }

  async listAssets(): Promise<MediaAsset[]> {
    const client = requireClient()
    const { data, error } = await client
      .from('media_assets')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to list media: ${error.message}`)
    }

    return ((data ?? []) as MediaAssetRow[]).map(mapAsset)
  }

  async deleteAsset(mediaAssetId: string): Promise<void> {
    const client = requireClient()
    const asset = await this.getAsset(mediaAssetId)

    const { error: storageError } = await client.storage
      .from(ACTIVITY_MEDIA_BUCKET)
      .remove([asset.path])
    if (storageError) {
      throw new Error(`Failed to delete media file: ${storageError.message}`)
    }

    const { error } = await client.from('media_assets').delete().eq('id', mediaAssetId)
    if (error) {
      throw new Error(`Failed to delete media asset: ${error.message}`)
    }

    this.signedUrlCache.delete(mediaAssetId)
  }

  async uploadVideo(activityId: string, file: File): Promise<MediaAsset> {
    return this.uploadMedia(activityId, file, 'video/mp4')
  }

  async uploadAudio(activityId: string, file: File): Promise<MediaAsset> {
    return this.uploadMedia(activityId, file, 'audio/mpeg')
  }

  async uploadImage(activityId: string, file: File): Promise<MediaAsset> {
    const sizeError = imageUploadSizeError(file.size)
    if (sizeError) {
      throw new Error(sizeError)
    }
    return this.uploadMedia(activityId, file, 'image/jpeg')
  }

  private async listAssetsByMime(mimePattern: string): Promise<MediaAsset[]> {
    const client = requireClient()
    const { data, error } = await client
      .from('media_assets')
      .select('*')
      .ilike('mime_type', mimePattern)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to list media: ${error.message}`)
    }

    return ((data ?? []) as MediaAssetRow[]).map(mapAsset)
  }

  private async uploadMedia(
    activityId: string,
    file: File,
    fallbackMime: string,
  ): Promise<MediaAsset> {
    const sizeError = videoUploadSizeError(file.size)
    if (sizeError) {
      throw new Error(sizeError)
    }

    const client = requireClient()
    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession()
    if (sessionError) {
      throw new Error(`Failed to read auth session: ${sessionError.message}`)
    }
    const userId = session?.user.id
    if (!userId) {
      throw new Error('Sign in required to upload media')
    }

    const id = crypto.randomUUID()
    const path = `${activityId}/${id}`
    const mimeType = file.type || fallbackMime
    const probe = await readMediaProbe(file)
    const originalFilename = sanitizeOriginalFilename(file.name)

    const { error: insertError } = await client.from('media_assets').insert({
      id,
      activity_id: activityId,
      bucket: ACTIVITY_MEDIA_BUCKET,
      path,
      mime_type: mimeType,
      size_bytes: file.size,
      duration_ms: probe.durationMs,
      width_px: probe.widthPx,
      height_px: probe.heightPx,
      original_filename: originalFilename,
      created_by: userId,
    })
    if (insertError) {
      throw new Error(`Failed to register media asset: ${insertError.message}`)
    }

    const { error: uploadError } = await client.storage
      .from(ACTIVITY_MEDIA_BUCKET)
      .upload(path, file, {
        contentType: mimeType,
        upsert: false,
      })
    if (uploadError) {
      await client.from('media_assets').delete().eq('id', id)
      if (/maximum allowed size/i.test(uploadError.message)) {
        throw new Error(
          `${uploadError.message}. In Supabase Dashboard, raise Storage → Settings global limit and the activity-media bucket limit (currently configured for up to 500 MB in this app).`,
        )
      }
      throw new Error(`Failed to upload media: ${uploadError.message}`)
    }

    return this.getAsset(id)
  }
}

async function readMediaProbe(file: File): Promise<{
  durationMs: number | null
  widthPx: number | null
  heightPx: number | null
}> {
  if (file.type.startsWith('image/')) {
    const size = await readImageSize(file)
    return { durationMs: null, widthPx: size.widthPx, heightPx: size.heightPx }
  }

  const kind = file.type.startsWith('audio/')
    ? 'audio'
    : file.type.startsWith('video/')
      ? 'video'
      : null
  if (!kind) return { durationMs: null, widthPx: null, heightPx: null }

  return new Promise((resolve) => {
    const element = document.createElement(kind)
    const objectUrl = URL.createObjectURL(file)
    element.preload = 'metadata'
    element.onloadedmetadata = () => {
      const seconds = element.duration
      const durationMs =
        Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null
      const widthPx =
        kind === 'video' && element instanceof HTMLVideoElement && element.videoWidth > 0
          ? element.videoWidth
          : null
      const heightPx =
        kind === 'video' && element instanceof HTMLVideoElement && element.videoHeight > 0
          ? element.videoHeight
          : null
      URL.revokeObjectURL(objectUrl)
      resolve({ durationMs, widthPx, heightPx })
    }
    element.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ durationMs: null, widthPx: null, heightPx: null })
    }
    element.src = objectUrl
  })
}

function readImageSize(
  file: File,
): Promise<{ widthPx: number | null; heightPx: number | null }> {
  return new Promise((resolve) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      const widthPx = image.naturalWidth > 0 ? image.naturalWidth : null
      const heightPx = image.naturalHeight > 0 ? image.naturalHeight : null
      URL.revokeObjectURL(objectUrl)
      resolve({ widthPx, heightPx })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ widthPx: null, heightPx: null })
    }
    image.src = objectUrl
  })
}

function sanitizeOriginalFilename(name: string): string | null {
  const trimmed = name.trim().replace(/[/\\]/g, '_')
  if (!trimmed) return null
  return trimmed.slice(0, 255)
}

function requireClient() {
  const client = getSupabase()
  if (!client) {
    throw new Error('Supabase client is not initialized')
  }
  return client
}
