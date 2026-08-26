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
      // Enough to paint/start; full canplaythrough may never fire on long clips.
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

/**
 * Load section definition(s) and warm their signed media (plus optional intro).
 */
export async function preloadLessonAssets(options: {
  introMediaId: string | null
  items: LessonCompositionItem[]
  label?: string
  onProgress?: (progress: LessonPreloadProgress) => void
}): Promise<LessonPreloadResult> {
  const { introMediaId, items, onProgress } = options
  const progressLabel = options.label?.trim() || 'Loading…'
  const sections = new Map<string, ActivityDefinition>()
  const retain: Array<HTMLVideoElement | HTMLImageElement> = []

  const report = (loaded: number, total: number, label: string) => {
    onProgress?.({ loaded, total, label })
  }

  report(0, Math.max(1, items.length), progressLabel)

  await Promise.all(
    items.map(async (item) => {
      const loaded = await services.persistence.getById(item.refId)
      if (!loaded) {
        throw new Error(`${item.title} could not be loaded.`)
      }
      sections.set(item.refId, cloneJson(loaded))
    }),
  )

  const mediaIds = new Set<string>()
  if (introMediaId) mediaIds.add(introMediaId)
  for (const definition of sections.values()) {
    for (const id of collectMediaAssetIds(definition)) {
      mediaIds.add(id)
    }
  }

  const ids = [...mediaIds]
  const total = Math.max(1, items.length + ids.length)
  let loadedCount = items.length
  report(loadedCount, total, progressLabel)

  const concurrency = 3
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const index = cursor
      cursor += 1
      const mediaId = ids[index]
      if (!mediaId) continue
      try {
        const asset = await services.media.getAsset(mediaId)
        const url = await services.media.getSignedUrl(mediaId)
        const element = await preloadMediaUrl(url, asset.mimeType, 60_000)
        retain.push(element)
      } catch {
        // Skip missing/failed assets; section runtime still surfaces errors.
      } finally {
        loadedCount += 1
        report(loadedCount, total, progressLabel)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, ids.length)) }, () =>
      worker(),
    ),
  )

  report(total, total, progressLabel)
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
