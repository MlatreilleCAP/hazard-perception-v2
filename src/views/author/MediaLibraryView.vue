<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { services } from '@/app/container'
import { useStudioAccess } from '@/composables/useStudioAccess'
import {
  formatMediaSize,
  mediaAssetDisplayName,
  type MediaAsset,
} from '@/types/media'

const { canEdit, isAdmin } = useStudioAccess()
const assets = ref<MediaAsset[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const menuOpenId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const filter = ref<'all' | 'video' | 'audio' | 'image'>('all')

const filtered = computed(() => {
  if (filter.value === 'all') return assets.value
  const prefix = `${filter.value}/`
  return assets.value.filter((asset) => asset.mimeType.startsWith(prefix))
})

function canDelete(asset: MediaAsset): boolean {
  return isAdmin.value || canEdit(asset.createdBy)
}

function kindLabel(mimeType: string): string {
  if (mimeType.startsWith('video/')) return 'Video'
  if (mimeType.startsWith('audio/')) return 'Audio'
  if (mimeType.startsWith('image/')) return 'Image'
  return mimeType
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = null
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

async function remove(asset: MediaAsset): Promise<void> {
  menuOpenId.value = null
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

        <ul v-else class="author-list">
          <li v-for="asset in filtered" :key="asset.id" class="author-list-row">
            <div style="min-width: 0; flex: 1">
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
            </div>
            <div class="author-menu">
              <button
                type="button"
                class="author-menu-btn"
                aria-label="More actions"
                @click="menuOpenId = menuOpenId === asset.id ? null : asset.id"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                  <circle cx="8" cy="3.5" r="1.25" />
                  <circle cx="8" cy="8" r="1.25" />
                  <circle cx="8" cy="12.5" r="1.25" />
                </svg>
              </button>
              <div v-if="menuOpenId === asset.id" class="author-menu-panel" role="menu">
                <button
                  v-if="canDelete(asset)"
                  type="button"
                  class="author-menu-item danger"
                  role="menuitem"
                  :disabled="deletingId === asset.id"
                  @click="remove(asset)"
                >
                  {{ deletingId === asset.id ? 'Deleting…' : 'Delete' }}
                </button>
                <p v-else class="author-menu-item" style="margin: 0; cursor: default">
                  View only
                </p>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
