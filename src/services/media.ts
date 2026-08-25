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
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export class MediaService {
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
    const durationMs = await readMediaDurationMs(file)

    const { error: insertError } = await client.from('media_assets').insert({
      id,
      activity_id: activityId,
      bucket: ACTIVITY_MEDIA_BUCKET,
      path,
      mime_type: mimeType,
      size_bytes: file.size,
      duration_ms: durationMs,
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

async function readMediaDurationMs(file: File): Promise<number | null> {
  const kind = file.type.startsWith('audio/')
    ? 'audio'
    : file.type.startsWith('video/')
      ? 'video'
      : null
  if (!kind) return null

  return new Promise((resolve) => {
    const element = document.createElement(kind)
    const objectUrl = URL.createObjectURL(file)
    element.preload = 'metadata'
    element.onloadedmetadata = () => {
      const seconds = element.duration
      URL.revokeObjectURL(objectUrl)
      if (!Number.isFinite(seconds) || seconds <= 0) {
        resolve(null)
        return
      }
      resolve(Math.round(seconds * 1000))
    }
    element.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }
    element.src = objectUrl
  })
}

function requireClient() {
  const client = getSupabase()
  if (!client) {
    throw new Error('Supabase client is not initialized')
  }
  return client
}
