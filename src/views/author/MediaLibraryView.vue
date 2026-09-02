<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import audioPreviewImage from '@/assets/media/audio-preview.png'
import { services } from '@/app/container'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { useStudioAccess } from '@/composables/useStudioAccess'
import {
  collectReferencedMediaAssetIds,
  deleteUnusedMediaAssets,
} from '@/services/mediaLibraryCleanup'
import {
  emptyMediaClipMetadata,
  formatMediaSize,
  mediaAssetDisplayName,
  mediaClipMetadataHasContent,
  mediaLibraryDraftForAsset,
  mediaLibraryKindFromMime,
  mediaLibraryKindLabel,
  parseMediaClipMetadata,
  MEDIA_CLIP_META_FIELDS,
  type MediaAsset,
  type MediaClipMetadata,
} from '@/types/media'

const { canCreate, canEdit, isAdmin } = useStudioAccess()
const assets = ref<MediaAsset[]>([])
const previewUrls = ref<Record<string, string>>({})
const posterUrls = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const deletingUnused = ref(false)
const scanningUsage = ref(false)
const referencedIds = ref<Set<string> | null>(null)
const uploading = ref(false)
const savingMeta = ref(false)
const metaDraft = ref<MediaClipMetadata>(emptyMediaClipMetadata())
const metaBaseline = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const LIBRARY_ACCEPT =
  'video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,image/jpeg,image/png,image/webp,image/gif,.mp4,.webm,.mov,.mp3,.m4a,.wav,.ogg,.jpg,.jpeg,.png,.webp,.gif'
const filter = ref<'all' | 'video' | 'audio' | 'image' | 'unused'>('all')
const searchQuery = ref('')
const selectedId = ref<string | null>(null)
let previewGeneration = 0

const filtered = computed(() => {
  const prefix = filter.value === 'all' || filter.value === 'unused' ? null : `${filter.value}/`
  const query = searchQuery.value.trim().toLowerCase()
  return assets.value.filter((asset) => {
    if (filter.value === 'unused' && !isUnused(asset)) return false
    if (prefix && !asset.mimeType.startsWith(prefix)) return false
    if (!query) return true
    const name = mediaAssetDisplayName(asset).toLowerCase()
    const kind = kindLabel(asset.mimeType).toLowerCase()
    const meta = [
      ...MEDIA_CLIP_META_FIELDS.map((field) => asset.metadata[field.key].toLowerCase()),
      ...(asset.metadata.rows ?? []).flatMap((row) => [
        row.name.toLowerCase(),
        row.text.toLowerCase(),
      ]),
    ]
    return (
      name.includes(query) ||
      kind.includes(query) ||
      asset.mimeType.toLowerCase().includes(query) ||
      meta.some((value) => value.includes(query))
    )
  })
})

const selected = computed(
  () => filtered.value.find((asset) => asset.id === selectedId.value) ?? null,
)
const previewDimensions = ref<{ width: number; height: number } | null>(null)

const showingMetaFields = computed(() => metaDraft.value.rows.length > 0)

const canEditSelectedMeta = computed(() => {
  const asset = selected.value
  if (!asset) return false
  return canCreate.value || isAdmin.value || canEdit(asset.createdBy)
})

const draftKindLabel = computed(() => mediaLibraryKindLabel(metaDraft.value.libraryKind))

const metaDirty = computed(
  () => showingMetaFields.value && snapshotMeta(metaDraft.value) !== metaBaseline.value,
)

function isUnused(asset: MediaAsset): boolean {
  return referencedIds.value ? !referencedIds.value.has(asset.id) : false
}

async function refreshUsage(): Promise<void> {
  scanningUsage.value = true
  try {
    referencedIds.value = await collectReferencedMediaAssetIds()
  } catch (cause) {
    referencedIds.value = null
    error.value = cause instanceof Error ? cause.message : 'Failed to scan media usage'
  } finally {
    scanningUsage.value = false
  }
}

function snapshotMeta(meta: MediaClipMetadata): string {
  return JSON.stringify({
    libraryKind: meta.libraryKind.trim(),
    rows: meta.rows.map((row) => ({
      name: row.name.trim(),
      text: row.text.trim(),
    })),
  })
}

function draftFromAsset(asset: MediaAsset): MediaClipMetadata {
  return mediaLibraryDraftForAsset(asset)
}

function loadMetaDraft(asset: MediaAsset | null): void {
  if (!asset) {
    metaDraft.value = emptyMediaClipMetadata()
    metaBaseline.value = snapshotMeta(metaDraft.value)
    return
  }
  metaDraft.value = draftFromAsset(asset)
  metaBaseline.value = snapshotMeta(metaDraft.value)
}

function canDelete(asset: MediaAsset): boolean {
  return isAdmin.value || canEdit(asset.createdBy)
}

const unusedAssets = computed(() =>
  referencedIds.value ? assets.value.filter((asset) => isUnused(asset)) : [],
)

const deletableUnusedAssets = computed(() => unusedAssets.value.filter(canDelete))

function kindLabel(mimeType: string): string {
  if (mimeType.startsWith('video/')) return 'Video'
  if (mimeType.startsWith('audio/')) return 'Audio'
  if (mimeType.startsWith('image/')) return 'Image'
  return mimeType
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
  if (isAudio(asset)) return audioPreviewImage
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
  loadMetaDraft(null)
  previewGeneration += 1
  previewUrls.value = {}
  posterUrls.value = {}
  try {
    assets.value = await services.media.listAssets()
    await refreshUsage()
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
    if (
      selectedId.value &&
      !list.some((asset) => asset.id === selectedId.value) &&
      !metaDirty.value
    ) {
      selectedId.value = null
    }
    void loadPreviewUrls(list)
  },
  { immediate: true },
)

function openPreview(asset: MediaAsset): void {
  if (metaDirty.value && selectedId.value !== asset.id) return
  selectedId.value = selectedId.value === asset.id && !metaDirty.value ? null : asset.id
}

function closePreview(): void {
  loadMetaDraft(null)
  selectedId.value = null
}

watch(selectedId, (id) => {
  previewDimensions.value = null
  loadMetaDraft(assets.value.find((asset) => asset.id === id) ?? null)
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

function chooseFiles(): void {
  if (!canCreate.value || uploading.value) return
  fileInput.value?.click()
}

async function onFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0 || !canCreate.value) return

  uploading.value = true
  error.value = null
  const uploaded: MediaAsset[] = []
  const failures: string[] = []
  for (const file of files) {
    try {
      uploaded.push(await services.media.uploadLibraryFile(file))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to upload'
      failures.push(`${file.name}: ${message}`)
    }
  }
  if (uploaded.length > 0) {
    assets.value = [...uploaded, ...assets.value]
    if (!metaDirty.value) {
      selectedId.value = uploaded[0].id
    }
    await refreshUsage()
  }
  if (failures.length > 0) {
    error.value = failures.join(' ')
  }
  uploading.value = false
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
    if (selectedId.value === asset.id) {
      loadMetaDraft(null)
      selectedId.value = null
    }
    if (referencedIds.value) {
      const next = new Set(referencedIds.value)
      next.delete(asset.id)
      referencedIds.value = next
    }
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to delete media')
  } finally {
    deletingId.value = null
  }
}

async function deleteUnused(): Promise<void> {
  const candidates = deletableUnusedAssets.value
  if (candidates.length === 0) {
    window.alert('No unused media files you can delete.')
    return
  }

  const totalBytes = candidates.reduce((sum, asset) => sum + (asset.sizeBytes ?? 0), 0)
  const sizeLabel = totalBytes > 0 ? formatMediaSize(totalBytes) : 'unknown size'
  if (
    !window.confirm(
      `Delete ${candidates.length} unused file${candidates.length === 1 ? '' : 's'} (${sizeLabel}) from storage? This cannot be undone.`,
    )
  ) {
    return
  }

  deletingUnused.value = true
  error.value = null
  try {
    const { deleted, failures } = await deleteUnusedMediaAssets(candidates)
    const deletedIds = new Set(deleted.map((asset) => asset.id))
    assets.value = assets.value.filter((asset) => !deletedIds.has(asset.id))
    previewUrls.value = Object.fromEntries(
      Object.entries(previewUrls.value).filter(([id]) => !deletedIds.has(id)),
    )
    posterUrls.value = Object.fromEntries(
      Object.entries(posterUrls.value).filter(([id]) => !deletedIds.has(id)),
    )
    if (selectedId.value && deletedIds.has(selectedId.value)) {
      loadMetaDraft(null)
      selectedId.value = null
    }
    if (referencedIds.value) {
      for (const id of deletedIds) referencedIds.value.delete(id)
    }
    if (failures.length > 0) {
      error.value = failures
        .map((item) => `${mediaAssetDisplayName(item.asset)}: ${item.message}`)
        .join(' ')
    }
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to delete unused media')
  } finally {
    deletingUnused.value = false
  }
}

async function saveMetadata(): Promise<void> {
  const asset = selected.value
  if (!asset || !canEditSelectedMeta.value || !metaDirty.value || savingMeta.value) return

  savingMeta.value = true
  error.value = null
  try {
    const kind =
      mediaLibraryKindFromMime(asset.mimeType) || metaDraft.value.libraryKind
    const savedMeta = parseMediaClipMetadata({
      libraryKind: kind,
      rows: metaDraft.value.rows.map((row) => ({
        name: row.name.trim(),
        text: row.text.trim(),
      })),
    })
    const saved = await services.media.updateAssetMetadata(asset.id, savedMeta)
    assets.value = assets.value.map((item) => (item.id === saved.id ? saved : item))
    metaDraft.value = draftFromAsset(saved)
    metaBaseline.value = snapshotMeta(metaDraft.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to save metadata'
  } finally {
    savingMeta.value = false
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
        <AuthorPillButton
          v-if="canCreate"
          variant="white"
          :disabled="uploading || deletingUnused"
          @click="chooseFiles"
        >
          {{ uploading ? 'Uploading…' : 'Upload' }}
        </AuthorPillButton>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          :accept="LIBRARY_ACCEPT"
          multiple
          @change="onFiles"
        />
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
          :class="{ active: filter === 'unused' }"
          @click="filter = 'unused'"
        >
          Unused ({{ scanningUsage ? '…' : unusedAssets.length }})
        </button>
      </div>

      <section v-if="selected" class="media-preview-stage">
        <div class="media-preview-stage-head">
          <div>
            <h2 class="media-preview-title">{{ mediaAssetDisplayName(selected) }}</h2>
            <p class="media-preview-sub">
              {{ kindLabel(selected.mimeType) }}
              -
              {{
                selected.sizeBytes != null
                  ? formatMediaSize(selected.sizeBytes)
                  : 'Unknown size'
              }}
            </p>
          </div>
          <div class="media-preview-stage-actions">
            <AuthorPillButton
              v-if="showingMetaFields && canEditSelectedMeta"
              variant="white"
              :disabled="savingMeta || !metaDirty"
              @click="saveMetadata"
            >
              {{ savingMeta ? 'Saving…' : 'Save' }}
            </AuthorPillButton>
            <button
              type="button"
              class="media-preview-dismiss"
              aria-label="Close preview"
              @click="closePreview"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
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
            <div
              v-else-if="isAudio(selected)"
              class="media-preview-audio-wrap"
            >
              <img
                class="media-preview-large media-preview-audio-art"
                :src="audioPreviewImage"
                alt=""
              />
              <audio
                class="media-preview-audio"
                :src="previewUrls[selected.id]"
                controls
              />
            </div>
          </div>
          <div class="media-meta-panel">
            <div class="media-meta-heading-row">
              <h3 class="media-meta-heading">Metadata</h3>
              <p v-if="draftKindLabel" class="media-meta-kind">{{ draftKindLabel }}</p>
            </div>
            <dl v-if="showingMetaFields" class="media-meta-list">
              <div
                v-for="(row, index) in metaDraft.rows"
                :key="`${row.name}-${index}`"
                class="media-meta-card"
              >
                <dt class="media-meta-label">{{ row.name }}</dt>
                <dd class="media-meta-value">
                  <input
                    v-model="row.text"
                    class="media-meta-input"
                    type="text"
                    :aria-label="row.name"
                    :readonly="!canEditSelectedMeta"
                  />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section class="author-list-card">
        <div class="author-list-card-head media-library-head">
          <h2>Library</h2>
          <span class="author-count">{{ filtered.length }}</span>
          <div class="media-library-head-actions">
            <button
              v-if="canCreate"
              type="button"
              class="media-library-toolbar-btn"
              :disabled="
                uploading || deletingUnused || scanningUsage || deletableUnusedAssets.length === 0
              "
              @click="deleteUnused"
            >
              {{
                deletingUnused
                  ? 'Deleting unused…'
                  : scanningUsage
                    ? 'Scanning…'
                    : `Delete unused (${deletableUnusedAssets.length})`
              }}
            </button>
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
        </div>

        <div v-if="loading" class="author-list-empty">
          <p class="author-muted">Loading media…</p>
        </div>

        <div v-else-if="filtered.length === 0" class="author-list-empty">
          <p class="author-muted">
            {{
              filter === 'unused'
                ? 'No unused media files.'
                : searchQuery.trim()
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
            :class="{
              'is-selected': selectedId === asset.id,
              'is-locked': metaDirty && selectedId !== asset.id,
            }"
          >
            <div class="media-library-thumb-wrap">
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
                <div v-else class="media-library-audio-thumb">
                  <span>{{ previewUrls[asset.id] ? kindLabel(asset.mimeType) : '…' }}</span>
                </div>
              </div>
              <span
                v-if="!mediaClipMetadataHasContent(asset.metadata)"
                class="media-library-meta-pill"
              >
                metadata
                <span class="media-library-meta-pill-x" aria-hidden="true">×</span>
              </span>
            </div>

            <div class="media-library-card-body">
              <p class="author-list-title" style="margin: 0">
                {{ mediaAssetDisplayName(asset) }}
              </p>
              <p class="author-list-sub">
                {{ kindLabel(asset.mimeType) }}
                ·
                {{ asset.sizeBytes != null ? formatMediaSize(asset.sizeBytes) : 'Unknown size' }}
                ·
                {{ formatDate(asset.createdAt) }}
              </p>
              <div class="media-library-card-actions">
                <button
                  type="button"
                  class="media-library-action"
                  :disabled="metaDirty && selectedId !== asset.id"
                  @click="openPreview(asset)"
                >
                  {{ selectedId === asset.id ? 'Hide' : 'Preview' }}
                </button>
                <button
                  v-if="canDelete(asset)"
                  type="button"
                  class="media-library-action media-library-delete"
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
