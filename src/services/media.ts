import { getSupabase } from '@/services/supabase'
import {
  ACTIVITY_MEDIA_BUCKET,
  collectMediaAssetIds,
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
}

function requireClient() {
  const client = getSupabase()
  if (!client) {
    throw new Error('Supabase client is not initialized')
  }
  return client
}
