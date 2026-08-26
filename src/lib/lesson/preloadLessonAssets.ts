import { services } from '@/app/container'
import { cloneJson } from '@/app/clone'
import type { ActivityDefinition } from '@/types/activity'
import { collectMediaAssetIds } from '@/types/media'
import type { LessonCompositionItem } from '@/types/lesson'

export type LessonPreloadProgress = {
  loaded: number
  total: number
  label: string
}

export type LessonPreloadResult = {
  sections: Map<string, ActivityDefinition>
  /** Keep elements alive so browser media buffers stay warm for playback. */
  retain: Array<HTMLVideoElement | HTMLImageElement>
}

export type LessonIntroPreloadResult = {
  src: string
  retain: Array<HTMLVideoElement | HTMLImageElement>
}

function preloadImage(url: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const image = new Image()
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(image)
    }
    const timer = window.setTimeout(done, timeoutMs)
    image.onload = () => {
      if (typeof image.decode === 'function') {
        void image.decode().then(done).catch(done)
        return
      }
      done()
    }
    image.onerror = done
    image.src = url
    if (image.complete && image.naturalWidth > 0) done()
  })
}

function preloadVideo(url: string, timeoutMs: number): Promise<HTMLVideoElement> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.style.display = 'none'
    document.body.appendChild(video)

    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      video.oncanplaythrough = null
      video.onloadeddata = null
      video.onerror = null
      resolve(video)
    }
    const timer = window.setTimeout(done, timeoutMs)
    video.oncanplaythrough = done
    video.onloadeddata = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) done()
    }
    video.onerror = done
    video.src = url
    void video.load()
  })
}

async function preloadMediaUrl(
  url: string,
  mimeType: string | null,
  timeoutMs: number,
): Promise<HTMLVideoElement | HTMLImageElement> {
  if (mimeType?.startsWith('image/')) {
    return preloadImage(url, timeoutMs)
  }
  return preloadVideo(url, timeoutMs)
}

async function preloadMediaIds(
  mediaIds: string[],
  progressLabel: string,
  onProgress?: (progress: LessonPreloadProgress) => void,
  initialLoaded = 0,
): Promise<Array<HTMLVideoElement | HTMLImageElement>> {
  const retain: Array<HTMLVideoElement | HTMLImageElement> = []
  const total = Math.max(1, initialLoaded + mediaIds.length)
  let loadedCount = initialLoaded

  const report = (loaded: number) => {
    onProgress?.({ loaded, total, label: progressLabel })
  }

  report(loadedCount)

  if (mediaIds.length === 0) {
    report(total)
    return retain
  }

  const concurrency = 3
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < mediaIds.length) {
      const index = cursor
      cursor += 1
      const mediaId = mediaIds[index]
      if (!mediaId) continue
      try {
        const asset = await services.media.getAsset(mediaId)
        const url = await services.media.getSignedUrl(mediaId)
        const element = await preloadMediaUrl(url, asset.mimeType, 60_000)
        retain.push(element)
      } catch {
        // Skip missing/failed assets; runtime still surfaces errors.
      } finally {
        loadedCount += 1
        report(loadedCount)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, mediaIds.length) }, () => worker()),
  )

  report(total)
  return retain
}

/** Warm the lesson intro clip only. */
export async function preloadIntroMedia(options: {
  mediaId: string
  onProgress?: (progress: LessonPreloadProgress) => void
}): Promise<LessonIntroPreloadResult> {
  const progressLabel = 'Loading…'
  options.onProgress?.({ loaded: 0, total: 1, label: progressLabel })

  const asset = await services.media.getAsset(options.mediaId)
  const src = await services.media.getSignedUrl(options.mediaId)
  const element = await preloadMediaUrl(src, asset.mimeType, 60_000)

  options.onProgress?.({ loaded: 1, total: 1, label: progressLabel })
  return { src, retain: [element] }
}

/** Load one lesson section and warm its media. */
export async function preloadLessonSection(options: {
  item: LessonCompositionItem
  /** Load published snapshots for learners; drafts for studio preview. */
  published?: boolean
  onProgress?: (progress: LessonPreloadProgress) => void
}): Promise<LessonPreloadResult> {
  const { item, onProgress, published = true } = options
  const loadSection = published
    ? services.persistence.getPublished.bind(services.persistence)
    : services.persistence.getById.bind(services.persistence)
  const progressLabel = 'Loading…'
  const sections = new Map<string, ActivityDefinition>()

  onProgress?.({ loaded: 0, total: 1, label: progressLabel })

  const loaded = await loadSection(item.refId)
  if (!loaded) {
    throw new Error(`${item.title} could not be loaded.`)
  }
  sections.set(item.refId, cloneJson(loaded))

  const mediaIds = [...collectMediaAssetIds(loaded)]
  const retain = await preloadMediaIds(mediaIds, progressLabel, onProgress, 1)

  return { sections, retain }
}

export function releaseLessonPreloadRetain(
  retain: Array<HTMLVideoElement | HTMLImageElement>,
): void {
  for (const element of retain) {
    if (element instanceof HTMLVideoElement) {
      element.pause()
      element.removeAttribute('src')
      element.load()
      element.remove()
    }
  }
  retain.length = 0
}
