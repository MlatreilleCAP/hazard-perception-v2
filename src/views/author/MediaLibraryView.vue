<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { services } from '@/app/container'
import { useStudioAccess } from '@/composables/useStudioAccess'
import {
  formatMediaSize,
  mediaAssetDisplayName,
  type MediaAsset,
} from '@/types/media'

const { canEdit, isAdmin } = useStudioAccess()
const assets = ref<MediaAsset[]>([])
const previewUrls = ref<Record<string, string>>({})
const posterUrls = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const filter = ref<'all' | 'video' | 'audio' | 'image' | 'lottie'>('all')
const searchQuery = ref('')
const selectedId = ref<string | null>(null)
let previewGeneration = 0

function isLottie(asset: MediaAsset): boolean {
  const mime = asset.mimeType.toLowerCase()
  const name = `${asset.originalFilename ?? ''} ${asset.path}`.toLowerCase()
  if (name.includes('.lottie')) return true
  if (mime.includes('lottie')) return true
  if (mime === 'application/json' || mime.endsWith('+json')) return true
  return name.endsWith('.json') && (mime.startsWith('application/') || mime === 'text/json')
}

const filtered = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return assets.value.filter((asset) => {
    if (filter.value === 'lottie') {
      if (!isLottie(asset)) return false
    } else if (filter.value !== 'all') {
      if (isLottie(asset) || !asset.mimeType.startsWith(`${filter.value}/`)) return false
    }
    if (!query) return true
    const name = mediaAssetDisplayName(asset).toLowerCase()
    const kind = kindLabel(asset).toLowerCase()
    return (
      name.includes(query) ||
      kind.includes(query) ||
      asset.mimeType.toLowerCase().includes(query)
    )
  })
})

const selected = computed(
  () => filtered.value.find((asset) => asset.id === selectedId.value) ?? null,
)
const previewDimensions = ref<{ width: number; height: number } | null>(null)

const SAMPLE_META = [
  { label: 'Time of Day', value: 'Daytime' },
  { label: 'Metadata Title', value: 'Metadata example' },
  { label: 'Metadata Title', value: 'Metadata example' },
  { label: 'Metadata Title', value: 'Metadata example' },
  { label: 'Metadata Title', value: 'Metadata example' },
  { label: 'Metadata Title', value: 'Metadata example' },
] as const

const selectedMeta = computed(() => (selected.value ? SAMPLE_META : []))

function canDelete(asset: MediaAsset): boolean {
  return isAdmin.value || canEdit(asset.createdBy)
}

function kindLabel(asset: MediaAsset): string {
  if (isLottie(asset)) return 'Lottie'
  if (asset.mimeType.startsWith('video/')) return 'Video'
  if (asset.mimeType.startsWith('audio/')) return 'Audio'
  if (asset.mimeType.startsWith('image/')) return 'Image'
  return asset.mimeType
}

function isImage(asset: MediaAsset): boolean {
  return asset.mimeType.startsWith('image/')
}

function isVideo(asset: MediaAsset): boolean {
  return asset.mimeType.startsWith('video/')
}

function isAudio(asset: MediaAsset): boolean {
  return asset.mimeType.startsWith('audio/')
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

function thumbSrc(asset: MediaAsset): string | null {
  if (isLottie(asset)) return null
  if (isVideo(asset)) return posterUrls.value[asset.id] ?? null
  return previewUrls.value[asset.id] ?? null
}

/** Seek a frame and rasterize so video cards show a still on production browsers. */
function captureVideoPoster(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      video.removeAttribute('src')
      video.load()
      resolve(value)
    }

    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.setAttribute('playsinline', '')

    const timeout = window.setTimeout(() => finish(null), 12_000)

    const draw = () => {
      try {
        const width = video.videoWidth
        const height = video.videoHeight
        if (!width || !height) {
          window.clearTimeout(timeout)
          finish(null)
          return
        }
        const canvas = document.createElement('canvas')
        const maxEdge = 480
        const scale = Math.min(1, maxEdge / Math.max(width, height))
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          window.clearTimeout(timeout)
          finish(null)
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        window.clearTimeout(timeout)
        finish(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        window.clearTimeout(timeout)
        finish(null)
      }
    }

    video.addEventListener(
      'seeked',
      () => {
        draw()
      },
      { once: true },
    )

    video.addEventListener(
      'loadeddata',
      () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0
        const seekTo = duration > 0 ? Math.min(0.15, duration * 0.05) : 0.01
        try {
          if (video.currentTime > 0) {
            draw()
            return
          }
          video.currentTime = seekTo
        } catch {
          draw()
        }
      },
      { once: true },
    )

    video.addEventListener(
      'error',
      () => {
        window.clearTimeout(timeout)
        finish(null)
      },
      { once: true },
    )

    // Media fragment helps some browsers decode a visible first frame.
    video.src = `${url}#t=0.1`
  })
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items]
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) return
      await worker(item)
    }
  })
  await Promise.all(runners)
}

async function loadPreviewUrls(list: MediaAsset[]): Promise<void> {
  const generation = ++previewGeneration
  const missingUrls = list.filter((asset) => !previewUrls.value[asset.id])
  const missingPosters = list.filter(
    (asset) => isVideo(asset) && !posterUrls.value[asset.id],
  )
  if (missingUrls.length === 0 && missingPosters.length === 0) return

  const nextUrls = { ...previewUrls.value }
  const nextPosters = { ...posterUrls.value }

  await mapPool(missingUrls, 4, async (asset) => {
    if (generation !== previewGeneration) return
    try {
      nextUrls[asset.id] = await services.media.getSignedUrl(asset.id)
    } catch {
      // Card keeps a placeholder when a signed URL fails.
    }
  })

  if (generation !== previewGeneration) return
  // Expose signed URLs immediately so images can render while posters generate.
  previewUrls.value = nextUrls

  const postersToBuild = list.filter(
    (asset) =>
      isVideo(asset) && Boolean(nextUrls[asset.id]) && !nextPosters[asset.id],
  )

  await mapPool(postersToBuild, 3, async (asset) => {
    if (generation !== previewGeneration) return
    const url = nextUrls[asset.id]
    if (!url) return
    try {
      const poster = await captureVideoPoster(url)
      if (poster) nextPosters[asset.id] = poster
    } catch {
      // Fall back to inline video thumb with a media fragment.
    }
  })

  if (generation !== previewGeneration) return
  posterUrls.value = nextPosters
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = null
  selectedId.value = null
  previewGeneration += 1
  previewUrls.value = {}
  posterUrls.value = {}
  try {
    assets.value = await services.media.listAssets()
  } catch (cause) {
    assets.value = []
    error.value = cause instanceof Error ? cause.message : 'Failed to load media'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
})

watch(
  filtered,
  (list) => {
    if (selectedId.value && !list.some((asset) => asset.id === selectedId.value)) {
      selectedId.value = null
    }
    void loadPreviewUrls(list)
  },
  { immediate: true },
)

function openPreview(asset: MediaAsset): void {
  selectedId.value = selectedId.value === asset.id ? null : asset.id
}

watch(selectedId, () => {
  previewDimensions.value = null
})

function recordPreviewSize(width: number, height: number): void {
  if (!width || !height) return
  previewDimensions.value = { width, height }
}

function fitPreviewVideo(event: Event): void {
  const el = event.target as HTMLVideoElement
  const w = el.videoWidth
  const h = el.videoHeight
  if (!w || !h) return
  recordPreviewSize(w, h)
  el.style.setProperty('--media-preview-aspect', `${w} / ${h}`)
  const parentWidth = el.parentElement?.clientWidth || w
  const maxHeightPx = Number.parseFloat(getComputedStyle(el).maxHeight) || 480
  let height = Math.min(maxHeightPx, h)
  let width = (w / h) * height
  if (width > parentWidth) {
    width = parentWidth
    height = width / (w / h)
  }
  el.style.width = `${Math.round(width)}px`
  el.style.height = `${Math.round(height)}px`
}

function fitPreviewImage(event: Event): void {
  const el = event.target as HTMLImageElement
  recordPreviewSize(el.naturalWidth, el.naturalHeight)
}

async function remove(asset: MediaAsset): Promise<void> {
  const name = mediaAssetDisplayName(asset)
  if (
    !window.confirm(
      `Delete "${name}" from the media library? This removes the file from storage.`,
    )
  ) {
    return
  }

  deletingId.value = asset.id
  try {
    await services.media.deleteAsset(asset.id)
    assets.value = assets.value.filter((item) => item.id !== asset.id)
    const { [asset.id]: _url, ...restUrls } = previewUrls.value
    const { [asset.id]: _poster, ...restPosters } = posterUrls.value
    previewUrls.value = restUrls
    posterUrls.value = restPosters
    if (selectedId.value === asset.id) selectedId.value = null
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to delete media')
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>Media</h1>
          <p>Browse uploaded media and delete files you no longer need</p>
        </div>
      </div>

      <p v-if="error" class="author-error">{{ error }}</p>

      <div class="mvp-section-nav" aria-label="Media type filter">
        <button
          type="button"
          class="mvp-section-tab"
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >
          All
        </button>
        <button
          type="button"
          class="mvp-section-tab"
          :class="{ active: filter === 'video' }"
          @click="filter = 'video'"
        >
          Video
        </button>
        <button
          type="button"
          class="mvp-section-tab"
          :class="{ active: filter === 'audio' }"
          @click="filter = 'audio'"
        >
          Audio
        </button>
        <button
          type="button"
          class="mvp-section-tab"
          :class="{ active: filter === 'image' }"
          @click="filter = 'image'"
        >
          Image
        </button>
        <button
          type="button"
          class="mvp-section-tab"
          :class="{ active: filter === 'lottie' }"
          @click="filter = 'lottie'"
        >
          Lotties
        </button>
      </div>

      <section v-if="selected" class="media-preview-stage">
        <div class="media-preview-stage-head">
          <div>
            <h2 class="media-preview-title">{{ mediaAssetDisplayName(selected) }}</h2>
            <p class="media-preview-sub">
              {{ kindLabel(selected) }}
              -
              {{
                selected.sizeBytes != null
                  ? formatMediaSize(selected.sizeBytes)
                  : 'Unknown size'
              }}
            </p>
          </div>
          <button type="button" class="media-preview-close" @click="selectedId = null">
            Close
          </button>
        </div>
        <div class="media-preview-body">
          <div class="media-preview-frame">
            <p v-if="!previewUrls[selected.id]" class="author-muted">Loading preview…</p>
            <img
              v-else-if="isImage(selected)"
              class="media-preview-large"
              :src="previewUrls[selected.id]"
              :alt="mediaAssetDisplayName(selected)"
              @load="fitPreviewImage"
            />
            <video
              v-else-if="isVideo(selected)"
              :key="selected.id"
              class="media-preview-large media-preview-video"
              :src="previewUrls[selected.id]"
              controls
              playsinline
              @loadedmetadata="fitPreviewVideo"
            />
            <audio
              v-else-if="isAudio(selected)"
              class="media-preview-audio"
              :src="previewUrls[selected.id]"
              controls
            />
            <div v-else-if="isLottie(selected)" class="media-library-audio-thumb">
              <span>Lottie</span>
            </div>
          </div>
          <div class="media-meta-panel">
            <h3 class="media-meta-heading">Metadata</h3>
            <dl class="media-meta-list">
              <div v-for="(item, index) in selectedMeta" :key="`${item.label}-${index}`" class="media-meta-card">
                <dt class="media-meta-label">{{ item.label }}</dt>
                <dd class="media-meta-value">{{ item.value }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section class="author-list-card">
        <div class="author-list-card-head media-library-head">
          <h2>Library</h2>
          <span class="author-count">{{ filtered.length }}</span>
          <label class="media-library-search">
            <span class="sr-only">Search library</span>
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search"
              autocomplete="off"
            />
          </label>
        </div>

        <div v-if="loading" class="author-list-empty">
          <p class="author-muted">Loading media…</p>
        </div>

        <div v-else-if="filtered.length === 0" class="author-list-empty">
          <p class="author-muted">
            {{
              searchQuery.trim()
                ? 'No media matches this search.'
                : 'No media in this filter.'
            }}
          </p>
        </div>

        <div v-else class="media-library-grid">
          <article
            v-for="asset in filtered"
            :key="asset.id"
            class="media-library-card"
            :class="{ 'is-selected': selectedId === asset.id }"
          >
            <div
              class="media-library-thumb"
              role="button"
              tabindex="0"
              :aria-label="`Preview ${mediaAssetDisplayName(asset)}`"
              @click="openPreview(asset)"
              @keydown.enter.prevent="openPreview(asset)"
              @keydown.space.prevent="openPreview(asset)"
            >
              <img
                v-if="thumbSrc(asset)"
                :src="thumbSrc(asset)!"
                :alt="mediaAssetDisplayName(asset)"
              />
              <video
                v-else-if="isVideo(asset) && previewUrls[asset.id]"
                :src="`${previewUrls[asset.id]}#t=0.1`"
                muted
                playsinline
                preload="auto"
              />
              <div v-else-if="isAudio(asset)" class="media-library-audio-thumb">
                <span>Audio</span>
              </div>
              <div v-else-if="isLottie(asset)" class="media-library-audio-thumb">
                <span>Lottie</span>
              </div>
              <div v-else class="media-library-audio-thumb">
                <span>{{ previewUrls[asset.id] ? kindLabel(asset) : '…' }}</span>
              </div>
            </div>

            <div class="media-library-card-body">
              <p class="author-list-title" style="margin: 0">
                {{ mediaAssetDisplayName(asset) }}
              </p>
              <p class="author-list-sub">
                {{ kindLabel(asset) }}
                ·
                {{ asset.sizeBytes != null ? formatMediaSize(asset.sizeBytes) : 'Unknown size' }}
                ·
                {{ formatDate(asset.createdAt) }}
              </p>
              <div class="media-library-card-actions">
                <button type="button" class="ghost-mini" @click="openPreview(asset)">
                  {{ selectedId === asset.id ? 'Hide' : 'Preview' }}
                </button>
                <button
                  v-if="canDelete(asset)"
                  type="button"
                  class="ghost-mini"
                  style="color: #dc2626"
                  :disabled="deletingId === asset.id"
                  @click="remove(asset)"
                >
                  {{ deletingId === asset.id ? 'Deleting…' : 'Delete' }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
