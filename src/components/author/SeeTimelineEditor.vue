<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { services } from '@/app/container'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import ProcessQuestionsForm from '@/components/author/ProcessQuestionsForm.vue'
import SeeHazardDetailsForm from '@/components/author/SeeHazardDetailsForm.vue'
import SeeHazardOverlay from '@/components/author/SeeHazardOverlay.vue'
import SeeTimelineTrack from '@/components/author/SeeTimelineTrack.vue'
import { DEFAULT_HAZARD_RADIUS } from '@/lib/hazards/constants'
import { getHazardStateAtTime } from '@/lib/hazards/interpolate'
import type { TrajectoryPoint } from '@/types/hazard'
import type { MediaRef } from '@/types/media'
import type { ProcessQuestionBank } from '@/types/questions'
import {
  adjustTrajectoryTimes,
  createEmptySeeHazard,
  DEFAULT_SEE_INSTRUCTION_PILL,
  type SeeHazard,
} from '@/types/see'

const props = defineProps<{
  activityId: string
  media: MediaRef | null
  duration: number
  hazards: SeeHazard[]
}>()

const emit = defineEmits<{
  'update:media': [value: MediaRef | null]
  'update:duration': [value: number]
  'update:hazards': [value: SeeHazard[]]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref<string | null>(null)
const currentTime = ref(0)
const duration = ref(props.duration)
const videoAspect = ref<number | null>(null)
const isPlaying = ref(false)
const selectedHazardId = ref<string | null>(null)
const newHazardRadius = ref(DEFAULT_HAZARD_RADIUS)
const replacing = ref(false)
const replaceError = ref<string | null>(null)
let playFrame = 0

const selectedHazard = computed(
  () => props.hazards.find((hazard) => hazard.id === selectedHazardId.value) ?? null,
)

watch(
  () => props.media?.media_asset_id,
  async (id) => {
    previewUrl.value = null
    videoAspect.value = null
    currentTime.value = 0
    isPlaying.value = false
    if (!id) return
    try {
      previewUrl.value = await services.media.getSignedUrl(id)
    } catch (cause) {
      replaceError.value = cause instanceof Error ? cause.message : 'Failed to load video'
    }
  },
  { immediate: true },
)

watch(
  () => props.duration,
  (value) => {
    if (value > 0) duration.value = value
  },
)

watch(
  () => props.hazards,
  (hazards) => {
    if (hazards.length === 1) {
      selectedHazardId.value = hazards[0]?.id ?? null
      return
    }
    if (hazards.length === 0) {
      selectedHazardId.value = null
      return
    }
    if (!selectedHazardId.value || !hazards.some((hazard) => hazard.id === selectedHazardId.value)) {
      selectedHazardId.value = null
    }
  },
  { immediate: true },
)

watch(
  () => [selectedHazardId.value, currentTime.value] as const,
  () => {
    const selected = selectedHazard.value
    if (
      !selected ||
      currentTime.value < selected.startTime ||
      currentTime.value > selected.endTime
    ) {
      return
    }
    const state = getHazardStateAtTime(selected, currentTime.value)
    if (state) newHazardRadius.value = state.radius
  },
)

function syncTime(): void {
  currentTime.value = videoRef.value?.currentTime ?? 0
}

function seek(time: number): void {
  const video = videoRef.value
  if (!video) return
  const clamped = Math.min(duration.value, Math.max(0, time))
  video.currentTime = clamped
  syncTime()
}

async function play(): Promise<void> {
  const video = videoRef.value
  if (!video) return
  try {
    if (
      video.ended ||
      (Number.isFinite(video.duration) &&
        video.duration > 0 &&
        video.currentTime >= video.duration - 0.05)
    ) {
      video.currentTime = 0
      syncTime()
    }
    await video.play()
    isPlaying.value = true
  } catch {
    isPlaying.value = false
  }
}

function pause(): void {
  videoRef.value?.pause()
  isPlaying.value = false
}

function togglePlay(): void {
  if (videoRef.value?.paused) {
    void play()
  } else {
    pause()
  }
}

function startPlayhead(): void {
  cancelAnimationFrame(playFrame)
  const tick = () => {
    syncTime()
    playFrame = requestAnimationFrame(tick)
  }
  playFrame = requestAnimationFrame(tick)
}

watch(isPlaying, (playing) => {
  if (playing) startPlayhead()
  else cancelAnimationFrame(playFrame)
})

onBeforeUnmount(() => cancelAnimationFrame(playFrame))

function patchHazards(next: SeeHazard[]): void {
  emit(
    'update:hazards',
    [...next].sort((a, b) => a.startTime - b.startTime),
  )
}

function updateHazard(id: string, patch: Partial<SeeHazard>): void {
  patchHazards(
    props.hazards.map((hazard) => (hazard.id === id ? { ...hazard, ...patch } : hazard)),
  )
}

function addHazard(): void {
  pause()
  const created = createEmptySeeHazard(
    props.hazards.length + 1,
    currentTime.value,
    duration.value,
    newHazardRadius.value,
  )
  patchHazards([...props.hazards, created])
  selectedHazardId.value = created.id
}

function removeHazard(): void {
  if (!selectedHazard.value) return
  if (!window.confirm('Remove this hazard?')) return
  patchHazards(props.hazards.filter((hazard) => hazard.id !== selectedHazard.value?.id))
  selectedHazardId.value = null
}

function onHazardTimesChange(hazard: SeeHazard, startTime: number, endTime: number): void {
  updateHazard(hazard.id, {
    startTime,
    endTime,
    trajectory: adjustTrajectoryTimes(hazard.trajectory, startTime, endTime),
  })
}

function onTrajectoryChange(hazard: SeeHazard, trajectory: TrajectoryPoint[]): void {
  updateHazard(hazard.id, { trajectory })
}

function onDetailsChange(details: SeeHazard): void {
  if (!selectedHazard.value) return
  updateHazard(selectedHazard.value.id, details)
}

function onQuestionsChange(questions: ProcessQuestionBank): void {
  if (!selectedHazard.value) return
  updateHazard(selectedHazard.value.id, { questions })
}

function onMissedVideoChange(video: MediaRef | null): void {
  if (!selectedHazard.value) return
  updateHazard(selectedHazard.value.id, { missedVideo: video })
}

function onInstructionTextChange(value: string): void {
  if (!selectedHazard.value) return
  updateHazard(selectedHazard.value.id, { instructionText: value })
}

function onInstructionPillChange(value: string): void {
  if (!selectedHazard.value) return
  updateHazard(selectedHazard.value.id, { instructionPill: value })
}

async function replaceVideo(file: File): Promise<void> {
  replacing.value = true
  replaceError.value = null
  pause()
  try {
    const asset = await services.media.uploadVideo(props.activityId, file)
    emit('update:media', { media_asset_id: asset.id })
    if (asset.durationMs && asset.durationMs > 0) {
      emit('update:duration', asset.durationMs / 1000)
      duration.value = asset.durationMs / 1000
    }
  } catch (cause) {
    replaceError.value = cause instanceof Error ? cause.message : 'Failed to replace video'
  } finally {
    replacing.value = false
  }
}

function onLoadedMetadata(): void {
  const video = videoRef.value
  const next = video?.duration ?? props.duration
  duration.value = Number.isFinite(next) && next > 0 ? next : props.duration
  if (duration.value > 0 && duration.value !== props.duration) {
    emit('update:duration', duration.value)
  }
  if (video?.videoWidth && video.videoHeight) {
    videoAspect.value = video.videoWidth / video.videoHeight
  }
  syncTime()
}

watch(previewUrl, () => {
  videoAspect.value = null
})
</script>

<template>
  <section v-if="media" class="author-stack-sm">
    <AuthorSectionHeader title="Add Video">
      <template #action>
        <AuthorPillButton variant="ghost" :disabled="replacing" @click="fileInput?.click()">
          {{ replacing ? 'Uploading…' : 'Replace Video' }}
        </AuthorPillButton>
      </template>
    </AuthorSectionHeader>

    <input
      ref="fileInput"
      class="sr-only"
      type="file"
      accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
      @change="
        ($event.target as HTMLInputElement).files?.[0] &&
          replaceVideo(($event.target as HTMLInputElement).files![0]!);
        ($event.target as HTMLInputElement).value = ''
      "
    />
    <p v-if="replaceError" class="author-error">{{ replaceError }}</p>

    <div
      class="see-video-frame"
      :style="videoAspect != null ? { aspectRatio: String(videoAspect) } : undefined"
    >
      <video
        v-if="previewUrl"
        ref="videoRef"
        :src="previewUrl"
        playsinline
        preload="auto"
        class="see-video"
        :class="{ 'is-fill': videoAspect != null }"
        @timeupdate="syncTime"
        @seeked="syncTime"
        @loadedmetadata="onLoadedMetadata"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @ended="isPlaying = false"
      />
      <SeeHazardOverlay
        :video="videoRef"
        :current-time="currentTime"
        :hazards="hazards"
        :selected-hazard-id="selectedHazardId"
        @trajectory-change="onTrajectoryChange"
      />
    </div>
  </section>

  <section v-if="media" class="author-stack-sm">
    <SeeTimelineTrack
      :duration="duration"
      :current-time="currentTime"
      :hazards="hazards"
      :selected-hazard-id="selectedHazardId"
      :add-disabled="duration <= 0"
      :is-playing="isPlaying"
      @select-hazard="selectedHazardId = $event"
      @seek="seek"
      @hazard-times-change="onHazardTimesChange"
      @trajectory-change="onTrajectoryChange"
      @add-hazard="addHazard"
      @remove-hazard="removeHazard"
      @toggle-play="togglePlay"
    />
  </section>

  <div v-if="media && !selectedHazard" class="see-empty-select">
    {{
      hazards.length === 0
        ? 'Add a hazard on the timeline to configure details and questions.'
        : 'Select a hazard on the timeline to edit its details and questions.'
    }}
  </div>

  <template v-else-if="selectedHazard">
    <SeeHazardDetailsForm
      :hazard-id="selectedHazard.id"
      :activity-id="activityId"
      :model-value="selectedHazard"
      @update:model-value="onDetailsChange"
    />
    <section class="author-stack-sm">
      <AuthorSectionHeader title="Instruction" />
      <p class="author-muted">
        Shown over the paused first frame of the hazard video until the learner taps Start.
      </p>
      <AuthorField
        :id="`${selectedHazard.id}-instruction-pill`"
        :model-value="selectedHazard.instructionPill ?? DEFAULT_SEE_INSTRUCTION_PILL"
        label="Pill label"
        @update:model-value="onInstructionPillChange"
      />
      <AuthorField
        :id="`${selectedHazard.id}-instruction`"
        :model-value="selectedHazard.instructionText ?? ''"
        label="Instruction text"
        placeholder="Instruction text goes here"
        multiline
        :rows="3"
        @update:model-value="onInstructionTextChange"
      />
    </section>
    <section class="author-stack-sm">
      <AuthorSectionHeader title="Video" />
      <p class="author-muted">
        Shown when the learner misses this hazard. After Continue, this video plays,
        then any configured severity and theory questions.
      </p>
      <MediaUploadField
        :id="`${selectedHazard.id}-missed-video`"
        :activity-id="activityId"
        label="Hazard video"
        :model-value="selectedHazard.missedVideo ?? null"
        :instruction-text="selectedHazard.instructionText"
        :instruction-pill="selectedHazard.instructionPill"
        @update:model-value="onMissedVideoChange"
      />
    </section>
    <ProcessQuestionsForm
      :key="selectedHazard.id"
      :segment-id="selectedHazard.id"
      :model-value="selectedHazard.questions"
      @update:model-value="onQuestionsChange"
    />
  </template>
</template>
