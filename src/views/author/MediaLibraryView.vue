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
const loading = ref(true)
const error = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const filter = ref<'all' | 'video' | 'audio' | 'image'>('all')
const selectedId = ref<string | null>(null)
let previewGeneration = 0

const filtered = computed(() => {
  if (filter.value === 'all') return assets.value
  const prefix = `${filter.value}/`
  return assets.value.filter((asset) => asset.mimeType.startsWith(prefix))
})

const selected = computed(
  () => filtered.value.find((asset) => asset.id === selectedId.value) ?? null,
)

function canDelete(asset: MediaAsset): boolean {
  return isAdmin.value || canEdit(asset.createdBy)
}

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

async function loadPreviewUrls(list: MediaAsset[]): Promise<void> {
  const generation = ++previewGeneration
  const missing = list.filter((asset) => !previewUrls.value[asset.id])
  if (missing.length === 0) return

  const next = { ...previewUrls.value }
  await Promise.all(
    missing.map(async (asset) => {
      try {
        next[asset.id] = await services.media.getSignedUrl(asset.id)
      } catch {
        // Leave missing; card shows a placeholder.
      }
    }),
  )
  if (generation !== previewGeneration) return
  previewUrls.value = next
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = null
  selectedId.value = null
  try {
    assets.value = await services.media.listAssets()
    previewUrls.value = {}
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
    const { [asset.id]: _removed, ...rest } = previewUrls.value
    previewUrls.value = rest
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
      </div>

      <section v-if="selected && previewUrls[selected.id]" class="media-preview-stage">
        <div class="media-preview-stage-head">
          <div>
            <p class="author-list-title" style="margin: 0">
              {{ mediaAssetDisplayName(selected) }}
            </p>
            <p class="author-list-sub">
              {{ kindLabel(selected.mimeType) }}
              ·
              {{
                selected.sizeBytes != null
                  ? formatMediaSize(selected.sizeBytes)
                  : 'Unknown size'
              }}
            </p>
          </div>
          <button type="button" class="ghost-mini" @click="selectedId = null">Close</button>
        </div>
        <img
          v-if="isImage(selected)"
          class="media-preview-large"
          :src="previewUrls[selected.id]"
          :alt="mediaAssetDisplayName(selected)"
        />
        <video
          v-else-if="isVideo(selected)"
          class="media-preview-large"
          :src="previewUrls[selected.id]"
          controls
          playsinline
        />
        <audio
          v-else-if="isAudio(selected)"
          class="media-preview-audio"
          :src="previewUrls[selected.id]"
          controls
        />
      </section>

      <section class="author-list-card">
        <div class="author-list-card-head">
          <h2>Library</h2>
          <span class="author-count">{{ filtered.length }}</span>
        </div>

        <div v-if="loading" class="author-list-empty">
          <p class="author-muted">Loading media…</p>
        </div>

        <div v-else-if="filtered.length === 0" class="author-list-empty">
          <p class="author-muted">No media in this filter.</p>
        </div>

        <div v-else class="media-library-grid">
          <article
            v-for="asset in filtered"
            :key="asset.id"
            class="media-library-card"
            :class="{ 'is-selected': selectedId === asset.id }"
          >
            <button
              type="button"
              class="media-library-thumb"
              :aria-label="`Preview ${mediaAssetDisplayName(asset)}`"
              @click="openPreview(asset)"
            >
              <img
                v-if="isImage(asset) && previewUrls[asset.id]"
                :src="previewUrls[asset.id]"
                :alt="mediaAssetDisplayName(asset)"
              />
              <video
                v-else-if="isVideo(asset) && previewUrls[asset.id]"
                :src="previewUrls[asset.id]"
                muted
                playsinline
                preload="metadata"
              />
              <div v-else-if="isAudio(asset)" class="media-library-audio-thumb">
                <span>Audio</span>
              </div>
              <div v-else class="media-library-audio-thumb">
                <span>{{ previewUrls[asset.id] ? kindLabel(asset.mimeType) : '…' }}</span>
              </div>
            </button>

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
