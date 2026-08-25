<script setup lang="ts">
import { ref, watch } from 'vue'
import { services } from '@/app/container'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import ProcessVideoStage from '@/components/process/ProcessVideoStage.vue'
import { formatMediaSize, maxVideoUploadBytes, videoUploadSizeError, type MediaAsset, type MediaRef } from '@/types/media'

const props = defineProps<{
  id: string
  label: string
  activityId: string
  modelValue: MediaRef | null
  instructionText?: string
  instructionPill?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: MediaRef | null]
  duration: [durationMs: number]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const error = ref<string | null>(null)
const libraryOpen = ref(false)
const libraryLoading = ref(false)
const libraryAssets = ref<MediaAsset[]>([])
const previewUrl = ref<string | null>(null)

async function refreshPreview(media: MediaRef | null): Promise<void> {
  if (!media?.media_asset_id) {
    previewUrl.value = null
    return
  }
  try {
    previewUrl.value = await services.media.getSignedUrl(media.media_asset_id)
  } catch {
    previewUrl.value = null
  }
}

watch(
  () => props.modelValue?.media_asset_id,
  () => {
    void refreshPreview(props.modelValue)
  },
  { immediate: true },
)

const maxUploadLabel = formatMediaSize(maxVideoUploadBytes())

async function handleFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const sizeError = videoUploadSizeError(file.size)
  if (sizeError) {
    error.value = sizeError
    return
  }

  uploading.value = true
  error.value = null
  try {
    const asset = await services.media.uploadVideo(props.activityId, file)
    emit('update:modelValue', { media_asset_id: asset.id })
    if (asset.durationMs && asset.durationMs > 0) {
      emit('duration', asset.durationMs)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to upload video'
  } finally {
    uploading.value = false
  }
}

async function openLibrary(): Promise<void> {
  libraryOpen.value = true
  libraryLoading.value = true
  error.value = null
  try {
    libraryAssets.value = await services.media.listVideoAssets()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load media'
    libraryOpen.value = false
  } finally {
    libraryLoading.value = false
  }
}

function selectAsset(asset: MediaAsset): void {
  emit('update:modelValue', { media_asset_id: asset.id })
  if (asset.durationMs && asset.durationMs > 0) {
    emit('duration', asset.durationMs)
  }
  libraryOpen.value = false
}

function clear(): void {
  emit('update:modelValue', null)
  emit('duration', 0)
}
</script>

<template>
  <div class="media-upload">
    <p class="author-field-label">{{ label }}</p>
    <div class="media-upload-row">
      <input
        :id="id"
        ref="fileInput"
        class="sr-only"
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
        @change="handleFile"
      />
      <AuthorPillButton variant="ghost" :disabled="uploading" @click="fileInput?.click()">
        {{ uploading ? 'Uploading…' : 'Upload' }}
      </AuthorPillButton>
      <AuthorPillButton variant="ghost" :disabled="uploading" @click="openLibrary">
        Media library
      </AuthorPillButton>
      <AuthorPillButton v-if="modelValue" variant="ghost" @click="clear">
        Remove
      </AuthorPillButton>
    </div>
    <p class="author-muted" style="margin-top: 4px; font-size: 12px">
      MP4, WebM, or MOV · max {{ maxUploadLabel }}
    </p>
    <p v-if="error" class="author-error">{{ error }}</p>

    <div v-if="libraryOpen" class="media-library">
      <p v-if="libraryLoading" class="author-muted">Loading media…</p>
      <p v-else-if="libraryAssets.length === 0" class="author-muted">No videos yet.</p>
      <button
        v-for="asset in libraryAssets"
        :key="asset.id"
        type="button"
        @click="selectAsset(asset)"
      >
        {{ asset.path.split('/').pop() }} · {{ asset.mimeType }}
      </button>
    </div>

    <ProcessVideoStage
      v-if="previewUrl && instructionText?.trim()"
      :src="previewUrl"
      :instruction-text="instructionText"
      :instruction-pill="instructionPill"
      compact
    />
    <video v-else-if="previewUrl" class="author-video" :src="previewUrl" controls playsinline />
  </div>
</template>
