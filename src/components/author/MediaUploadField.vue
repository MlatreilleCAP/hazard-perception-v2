<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { services } from '@/app/container'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import ProcessVideoStage from '@/components/process/ProcessVideoStage.vue'
import {
  formatMediaSize,
  imageUploadSizeError,
  MAX_IMAGE_UPLOAD_BYTES,
  maxVideoUploadBytes,
  videoUploadSizeError,
  type MediaAsset,
  type MediaRef,
} from '@/types/media'

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    activityId: string
    modelValue: MediaRef | null
    instructionText?: string
    instructionPill?: string
    kind?: 'video' | 'audio' | 'image'
  }>(),
  { kind: 'video' },
)

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

function fitAuthorVideo(event: Event): void {
  const el = event.target as HTMLVideoElement
  const w = el.videoWidth
  const h = el.videoHeight
  if (!w || !h) return
  el.style.setProperty('--author-video-aspect', `${w} / ${h}`)
  const parentWidth = el.parentElement?.clientWidth || w
  const maxHeightPx = Number.parseFloat(getComputedStyle(el).maxHeight) || 384
  let height = Math.min(maxHeightPx, h)
  let width = (w / h) * height
  if (width > parentWidth) {
    width = parentWidth
    height = width / (w / h)
  }
  el.style.width = `${Math.round(width)}px`
  el.style.height = `${Math.round(height)}px`
}

const isAudio = computed(() => props.kind === 'audio')
const isImage = computed(() => props.kind === 'image')
const kindLabel = computed(() =>
  isImage.value ? 'image' : isAudio.value ? 'audio' : 'video',
)
const maxUploadLabel = computed(() =>
  formatMediaSize(isImage.value ? MAX_IMAGE_UPLOAD_BYTES : maxVideoUploadBytes()),
)
const accept = computed(() => {
  if (isImage.value) return 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'
  if (isAudio.value) return 'audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg'
  return 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
})
const formatHint = computed(() => {
  if (isImage.value) return `JPG, PNG, WebP, or GIF · max ${maxUploadLabel.value}`
  if (isAudio.value) return `MP3, M4A, WAV, or OGG · max ${maxUploadLabel.value}`
  return `MP4, WebM, or MOV · max ${maxUploadLabel.value}`
})
const emptyLibraryLabel = computed(() => {
  if (isImage.value) return 'No images yet.'
  if (isAudio.value) return 'No audio yet.'
  return 'No videos yet.'
})

async function uploadFile(file: File): Promise<MediaAsset> {
  if (isImage.value) return services.media.uploadImage(props.activityId, file)
  if (isAudio.value) return services.media.uploadAudio(props.activityId, file)
  return services.media.uploadVideo(props.activityId, file)
}

async function handleFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const sizeError = isImage.value
    ? imageUploadSizeError(file.size)
    : videoUploadSizeError(file.size)
  if (sizeError) {
    error.value = sizeError
    return
  }

  uploading.value = true
  error.value = null
  try {
    const asset = await uploadFile(file)
    emit('update:modelValue', { media_asset_id: asset.id })
    if (asset.durationMs && asset.durationMs > 0) {
      emit('duration', asset.durationMs)
    }
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : `Failed to upload ${kindLabel.value}`
  } finally {
    uploading.value = false
  }
}

async function openLibrary(): Promise<void> {
  libraryOpen.value = true
  libraryLoading.value = true
  error.value = null
  try {
    libraryAssets.value = isImage.value
      ? await services.media.listImageAssets()
      : isAudio.value
        ? await services.media.listAudioAssets()
        : await services.media.listVideoAssets()
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
        :accept="accept"
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
      {{ formatHint }}
    </p>
    <p v-if="error" class="author-error">{{ error }}</p>

    <div v-if="libraryOpen" class="media-library">
      <p v-if="libraryLoading" class="author-muted">Loading media…</p>
      <p v-else-if="libraryAssets.length === 0" class="author-muted">
        {{ emptyLibraryLabel }}
      </p>
      <button
        v-for="asset in libraryAssets"
        :key="asset.id"
        type="button"
        @click="selectAsset(asset)"
      >
        {{ asset.path.split('/').pop() }} · {{ asset.mimeType }}
      </button>
    </div>

    <img
      v-if="previewUrl && isImage"
      class="author-image"
      :src="previewUrl"
      alt=""
    />
    <audio v-else-if="previewUrl && isAudio" class="author-audio" :src="previewUrl" controls />
    <ProcessVideoStage
      v-else-if="previewUrl && instructionText?.trim()"
      :src="previewUrl"
      :instruction-text="instructionText"
      :instruction-pill="instructionPill"
      compact
    />
    <video
      v-else-if="previewUrl"
      class="author-video"
      :src="previewUrl"
      controls
      playsinline
      @loadedmetadata="fitAuthorVideo"
    />
  </div>
</template>
