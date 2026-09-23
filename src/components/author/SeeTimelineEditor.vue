<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { services } from '@/app/container'
import AuthorField from '@/components/author/AuthorField.vue'
import FieldPair from '@/components/author/FieldPair.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import ProcessQuestionsForm from '@/components/author/ProcessQuestionsForm.vue'
import SeeHazardDetailsForm from '@/components/author/SeeHazardDetailsForm.vue'
import SeeHazardOverlay from '@/components/author/SeeHazardOverlay.vue'
import SeeTimelineTrack from '@/components/author/SeeTimelineTrack.vue'
import { DEFAULT_HAZARD_RADIUS } from '@/lib/hazards/constants'
import { interpolateTrajectoryAtTime } from '@/lib/hazards/interpolate'
import { hazardTriggerTrajectories, type TrajectoryPoint } from '@/types/hazard'
import type { MediaRef } from '@/types/media'
import type { ProcessQuestionBank } from '@/types/questions'
import {
  appendTriggerAtPlayhead,
  applyHazardTriggerTrajectory,
  applyTriggerTimes,
  createEmptySeeHazard,
  DEFAULT_SEE_INSTRUCTION_PILL,
  removeHazardTrigger,
  type SeeHazard,
} from '@/types/see'

const props = withDefaults(
  defineProps<{
    activityId: string
    media: MediaRef | null
    duration: number
    hazards: SeeHazard[]
    englishHazards?: SeeHazard[] | null
    readonly?: boolean
  }>(),
  { readonly: false, englishHazards: null },
)

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
const selectedTriggerIndex = ref(0)
const newHazardRadius = ref(DEFAULT_HAZARD_RADIUS)
const replacing = ref(false)
const replaceError = ref<string | null>(null)
let playFrame = 0

const selectedHazard = computed(
  () => props.hazards.find((hazard) => hazard.id === selectedHazardId.value) ?? null,
)
const draftHazard = ref<SeeHazard | null>(null)
const editingHazard = computed(() => selectedHazard.value ?? draftHazard.value)
/** Spreadsheet import writes the coaching clip and explanation image onto the first hazard. */
const coachingHazard = computed(
  () => selectedHazard.value ?? props.hazards[0] ?? draftHazard.value,
)
const englishHazard = computed(() => {
  const hazards = props.englishHazards
  const current = coachingHazard.value
  if (!hazards?.length || !current) return null
  const index = props.hazards.findIndex((hazard) => hazard.id === current.id)
  return hazards[index >= 0 ? index : 0] ?? null
})

function createDraftHazard(): SeeHazard {
  const span = duration.value > 0 ? duration.value : 10
  return createEmptySeeHazard(1, 0, span, newHazardRadius.value)
}

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
    if (hazards.length === 0) {
      selectedHazardId.value = null
      selectedTriggerIndex.value = 0
      if (!draftHazard.value) draftHazard.value = createDraftHazard()
      return
    }
    draftHazard.value = null
    if (hazards.length === 1) {
      const onlyId = hazards[0]?.id ?? null
      if (selectedHazardId.value !== onlyId) selectedHazardId.value = onlyId
      return
    }
    if (!selectedHazardId.value || !hazards.some((hazard) => hazard.id === selectedHazardId.value)) {
      selectedHazardId.value = null
      selectedTriggerIndex.value = 0
    }
  },
  { immediate: true },
)

watch(selectedHazardId, (id, previous) => {
  if (id !== previous) selectedTriggerIndex.value = 0
})

watch(
  selectedHazard,
  (hazard) => {
    if (!hazard) {
      selectedTriggerIndex.value = 0
      return
    }
    const last = Math.max(0, hazardTriggerTrajectories(hazard).length - 1)
    if (selectedTriggerIndex.value > last) selectedTriggerIndex.value = last
  },
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
    const trajectories = hazardTriggerTrajectories(selected)
    const trajectory = trajectories[selectedTriggerIndex.value] ?? selected.trajectory
    const state = interpolateTrajectoryAtTime(selected, trajectory, currentTime.value)
    if (state) newHazardRadius.value = state.radius
  },
)

let pendingSeek: number | null = null

function clampSeek(time: number): number {
  return Math.min(Math.max(0, time), Math.max(0, duration.value))
}

function syncTime(): void {
  const video = videoRef.value
  if (!video || video.seeking || pendingSeek != null) return
  currentTime.value = video.currentTime
}

function flushSeek(): void {
  const video = videoRef.value
  if (!video || pendingSeek == null) return
  const next = pendingSeek
  pendingSeek = null
  if (Math.abs(video.currentTime - next) < 0.0005) return
  try {
    video.currentTime = next
  } catch {
    /* ignore seek errors before the video can decode */
  }
}

function seek(time: number): void {
  const video = videoRef.value
  if (!video) return
  const clamped = clampSeek(time)
  currentTime.value = clamped
  pendingSeek = clamped
  if (!video.paused) {
    video.pause()
    isPlaying.value = false
  }
  if (!video.seeking) flushSeek()
}

function onSeeked(): void {
  flushSeek()
  if (pendingSeek != null) return
  currentTime.value = videoRef.value?.currentTime ?? currentTime.value
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
  if (props.readonly) return
  emit(
    'update:hazards',
    [...next].sort((a, b) => a.startTime - b.startTime),
  )
}

function updateHazard(id: string, patch: Partial<SeeHazard>): void {
  if (props.readonly) return
  patchHazards(
    props.hazards.map((hazard) => (hazard.id === id ? { ...hazard, ...patch } : hazard)),
  )
}

function addHazard(): void {
  if (props.readonly) return
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
  if (props.readonly || !selectedHazard.value) return
  if (!window.confirm('Remove this hazard?')) return
  patchHazards(props.hazards.filter((hazard) => hazard.id !== selectedHazard.value?.id))
  selectedHazardId.value = null
}

function onHazardTimesChange(
  hazard: SeeHazard,
  startTime: number,
  endTime: number,
  triggerIndex: number,
): void {
  updateHazard(hazard.id, applyTriggerTimes(hazard, triggerIndex, startTime, endTime))
}

function onTrajectoryChange(
  hazard: SeeHazard,
  trajectory: TrajectoryPoint[],
  triggerIndex: number,
): void {
  updateHazard(hazard.id, applyHazardTriggerTrajectory(hazard, triggerIndex, trajectory))
}

function addTriggerPoint(): void {
  if (props.readonly || !selectedHazard.value) return
  const hazard = selectedHazard.value
  const source =
    interpolateTrajectoryAtTime(
      hazard,
      hazardTriggerTrajectories(hazard)[selectedTriggerIndex.value] ?? hazard.trajectory,
      currentTime.value,
      { ignoreStartTime: true },
    ) ?? { x: 50, y: 50, radius: hazard.radius }
  const nextIndex = (hazard.extraTrajectories?.length ?? 0) + 1
  updateHazard(
    hazard.id,
    appendTriggerAtPlayhead(hazard, currentTime.value, duration.value, source),
  )
  selectedTriggerIndex.value = nextIndex
}

function removeTriggerPoint(): void {
  if (props.readonly || !selectedHazard.value) return
  const patch = removeHazardTrigger(selectedHazard.value, selectedTriggerIndex.value)
  if (!patch) return
  updateHazard(selectedHazard.value.id, patch)
  selectedTriggerIndex.value = Math.max(0, selectedTriggerIndex.value - 1)
}

function selectHazard(id: string | null): void {
  selectedHazardId.value = id
}

function commitEditingHazard(patch: Partial<SeeHazard> | SeeHazard): void {
  if (props.readonly) return
  const current = editingHazard.value ?? createDraftHazard()
  const next = { ...current, ...patch }
  if (!props.hazards.some((hazard) => hazard.id === current.id)) {
    patchHazards([...props.hazards, next])
    selectedHazardId.value = next.id
    draftHazard.value = null
    return
  }
  updateHazard(current.id, patch)
}

function commitCoachingHazard(patch: Partial<SeeHazard>): void {
  if (props.readonly) return
  const current = coachingHazard.value
  if (!current || !props.hazards.some((hazard) => hazard.id === current.id)) {
    commitEditingHazard(patch)
    return
  }
  updateHazard(current.id, patch)
}

function onDetailsChange(details: SeeHazard): void {
  commitCoachingHazard(details)
}

function onQuestionsChange(questions: ProcessQuestionBank): void {
  commitCoachingHazard({ questions })
}

function onMissedVideoChange(video: MediaRef | null): void {
  commitCoachingHazard({ missedVideo: video })
}

function onInstructionTextChange(value: string): void {
  commitCoachingHazard({ instructionText: value })
}

function onInstructionPillChange(value: string): void {
  commitCoachingHazard({ instructionPill: value })
}

async function replaceVideo(file: File): Promise<void> {
  if (props.readonly) return
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
      <template v-if="!readonly" #action>
        <AuthorPillButton variant="ghost" :disabled="replacing" @click="fileInput?.click()">
          {{ replacing ? 'Uploading…' : 'Replace Video' }}
        </AuthorPillButton>
      </template>
    </AuthorSectionHeader>

    <input
      v-if="!readonly"
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
        @seeked="onSeeked"
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
        :selected-trigger-index="selectedTriggerIndex"
        :readonly="readonly"
        @trajectory-change="onTrajectoryChange"
        @select-trigger="selectedTriggerIndex = $event"
      />
    </div>
  </section>

  <section v-if="media" class="author-stack-sm">
    <SeeTimelineTrack
      :duration="duration"
      :current-time="currentTime"
      :hazards="hazards"
      :selected-hazard-id="selectedHazardId"
      :selected-trigger-index="selectedTriggerIndex"
      :add-disabled="readonly || duration <= 0"
      :remove-disabled="readonly"
      :is-playing="isPlaying"
      @select-hazard="selectHazard"
      @select-trigger="selectedTriggerIndex = $event"
      @seek="seek"
      @hazard-times-change="onHazardTimesChange"
      @trajectory-change="onTrajectoryChange"
      @add-hazard="addHazard"
      @remove-hazard="removeHazard"
      @add-trigger="addTriggerPoint"
      @remove-trigger="removeTriggerPoint"
      @toggle-play="togglePlay"
    />
  </section>

  <div v-if="coachingHazard || editingHazard" class="author-stack">
    <SeeHazardDetailsForm
      v-if="coachingHazard"
      :hazard-id="coachingHazard.id"
      :activity-id="activityId"
      :model-value="coachingHazard"
      :english="englishHazard"
      @update:model-value="onDetailsChange"
    />

    <template v-if="coachingHazard">
      <section class="author-stack-sm">
        <AuthorSectionHeader title="Instruction" />
        <p class="author-muted">
          Shown over the paused first frame of the coaching video until the learner taps Continue.
        </p>
        <FieldPair
          :enabled="!!englishHazard"
          label="Pill label"
          :value="englishHazard?.instructionPill"
        >
          <AuthorField
            :id="`${coachingHazard.id}-instruction-pill`"
            :model-value="coachingHazard.instructionPill ?? DEFAULT_SEE_INSTRUCTION_PILL"
            label="Pill label"
            :disabled="readonly"
            @update:model-value="onInstructionPillChange"
          />
        </FieldPair>
        <FieldPair
          :enabled="!!englishHazard"
          label="Instruction text"
          :value="englishHazard?.instructionText"
          multiline
        >
          <AuthorField
            :id="`${coachingHazard.id}-instruction`"
            :model-value="coachingHazard.instructionText ?? ''"
            label="Instruction text"
            placeholder="Instruction text goes here"
            multiline
            :rows="3"
            :disabled="readonly"
            @update:model-value="onInstructionTextChange"
          />
        </FieldPair>
      </section>
      <section class="author-stack-sm">
        <AuthorSectionHeader title="Video" />
        <p class="author-muted">
          Coaching clip. After Continue, this video plays, then any configured severity
          and theory questions.
        </p>
        <MediaUploadField
          :id="`${coachingHazard.id}-missed-video`"
          :activity-id="activityId"
          label="Coaching video"
          :model-value="coachingHazard.missedVideo ?? null"
          :instruction-text="coachingHazard.instructionText"
          :instruction-pill="coachingHazard.instructionPill"
          :readonly="readonly"
          @update:model-value="onMissedVideoChange"
        />
      </section>
    </template>

    <ProcessQuestionsForm
      v-if="coachingHazard"
      :key="coachingHazard.id"
      :segment-id="coachingHazard.id"
      :model-value="coachingHazard.questions"
      :english-questions="englishHazard?.questions ?? null"
      @update:model-value="onQuestionsChange"
    />
  </div>
</template>
