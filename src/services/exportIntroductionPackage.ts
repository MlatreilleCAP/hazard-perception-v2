import JSZip from 'jszip'
import { readIntroductionDefinition } from '@/activities/introductionDefinition'
import { services } from '@/app/container'
import { slugForFilename } from '@/lib/inroadsMvp/buildImportTemplate'
import { mediaAssetDisplayName } from '@/types/media'

export async function exportIntroductionAssetsZip(
  activityId: string,
): Promise<{ blob: Blob; filename: string }> {
  const published = await services.persistence.getPublished(activityId)
  if (!published) throw new Error('Published stand alone video was not found')
  const intro = readIntroductionDefinition(published)
  const files: Array<{ id: string; fallback: string }> = []
  if (intro.introMedia?.media_asset_id) {
    files.push({ id: intro.introMedia.media_asset_id, fallback: 'video' })
  }
  if (intro.introCaptions?.media_asset_id) {
    files.push({ id: intro.introCaptions.media_asset_id, fallback: 'captions.vtt' })
  }
  if (intro.exampleMedia?.media_asset_id) {
    files.push({ id: intro.exampleMedia.media_asset_id, fallback: 'example' })
  }
  if (files.length === 0) throw new Error('This stand alone video has no media to download')

  const zip = new JSZip()
  const used = new Set<string>()
  for (const file of files) {
    const asset = await services.media.getAsset(file.id)
    const filename = uniqueZipFilename(safeZipFilename(mediaAssetDisplayName(asset), file.fallback), used)
    zip.file(filename, await services.media.getBlob(file.id))
  }
  const title = published.metadata.title.trim() || 'stand-alone-video'
  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    filename: `${slugForFilename(title)}-package.zip`,
  }
}

function safeZipFilename(name: string, fallback: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .replace(/^\.+/, '')
  return cleaned || fallback
}

function uniqueZipFilename(name: string, used: Set<string>): string {
  const key = name.toLowerCase()
  if (!used.has(key)) {
    used.add(key)
    return name
  }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let index = 2
  let next = `${stem}-${index}${ext}`
  while (used.has(next.toLowerCase())) {
    index += 1
    next = `${stem}-${index}${ext}`
  }
  used.add(next.toLowerCase())
  return next
}
