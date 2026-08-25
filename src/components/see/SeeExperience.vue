<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { readSeeDefinition } from '@/activities/seeDefinition'
import { services } from '@/app/container'
import ProcessInstructionCard from '@/components/process/ProcessInstructionCard.vue'
import ProcessResultsQuestionList from '@/components/process/ProcessResultsQuestionList.vue'
import ProcessSeverityPopover from '@/components/process/ProcessSeverityPopover.vue'
import ProcessTheoryPopover from '@/components/process/ProcessTheoryPopover.vue'
import AttemptTouchFeedback from '@/components/see/AttemptTouchFeedback.vue'
import ClickConfetti from '@/components/see/ClickConfetti.vue'
import SeeHazardFeedbackCard from '@/components/see/SeeHazardFeedbackCard.vue'
import SeeResultsPassCard from '@/components/see/SeeResultsPassCard.vue'
import { playHitTapSound, playMissTapSound, stopHitTapSound, unlockTapAudio } from '@/lib/audio/tapFeedback'
import {
  clientToPercent,
  landscapeVideoDisplaySize,
  SEE_INITIAL_PAN_OFFSET_X,
  VIDEO_PAN_SLOP_PX,
  videoAspectRatio,
} from '@/lib/hazards/coordinates'
import {
  CORRECT_HIT_REVEAL_MS,
  ENGAGEMENT_DELAY_MS,
  HIT_MARKER_DURATION_MS,
  MARKER_DURATION_MS,
  MAX_HAZARD_ATTEMPTS,
  OUT_OF_ATTEMPTS_CAPTION_MS,
} from '@/lib/hazards/attempts'
import {
  activeHazardAtTime,
  closedHazardIds,
  isClickOnHazard,
  targetHazardForClick,
} from '@/lib/hazards/hitDetection'
import type { ActivityDefinition } from '@/types/activity'
import {
  configuredSurveyQuestions,
  processQuestionResults,
  type ProcessQuestionResult,
  type ProcessSurveyQuestion,
} from '@/types/questions'

const props = defineProps<{
  definition: ActivityDefinition
}>()

const emit = defineEmits<{
  finished: []
}>()

type Phase = 'ready' | 'playing' | 'results'

type Overlay =
  | { step: 'success'; hazardId: string; attempts: number }
  | { step: 'missed'; hazardId: string }
  | { step: 'question'; hazardId: string; questionIndex: number }

type ClickMarker = {
  id: string
  x: number
  y: number
  isHit: boolean
  attempts: number
}

const src = ref<string | null>(null)
const error = ref<string | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const phase = ref<Phase>('ready')
const currentTime = ref(0)
const videoAspect = ref(16 / 9)
const panX = ref(0)
const viewportSize = ref({ width: 0, height: 0 })
const answers = ref<Record<string, number>>({})
const clickMarkers = ref<ClickMarker[]>([])
const resolvedIds = ref<Set<string>>(new Set())
const deferredMissIds = ref<Set<string>>(new Set())
const passedEndIds = ref<Set<string>>(new Set())
const trackingHazardId = ref<string | null>(null)
const attemptCount = ref(0)
const celebrating = ref(false)
const clipEnded = ref(false)
const outOfAttemptsCaption = ref(false)
const overlay = ref<Overlay | null>(null)
const deferredMissQueue = ref<string[]>([])
const hitAttempts = ref<Record<string, number>>({})

let playFrame = 0
let outOfAttemptsTimer = 0
let missTimer = 0
let hitTimer = 0
let didCenterPan = false
let resizeObserver: ResizeObserver | null = null
let pointerStart: { x: number; y: number; pan: number; pointerId: number } | null = null
let pointerPanned = false

const see = computed(() => readSeeDefinition(props.definition))
const sortedHazards = computed(() =>
  [...see.value.hazards].sort((a, b) => a.startTime - b.startTime),
)
const questions = computed(() =>
  see.value.hazards.flatMap((hazard) =>
    configuredSurveyQuestions(hazard.questions).map((question) => ({
      hazard,
      question,
    })),
  ),
)
const overlayHazard = computed(
  () => sortedHazards.value.find((hazard) => hazard.id === overlay.value?.hazardId) ?? null,
)
const overlayQuestions = computed(() =>
  overlayHazard.value ? configuredSurveyQuestions(overlayHazard.value.questions) : [],
)
const overlayQuestion = computed(() =>
  overlay.value?.step === 'question'
    ? overlayQuestions.value[overlay.value.questionIndex] ?? null
    : null,
)
const questionResults = computed((): ProcessQuestionResult[] => {
  const bank = {
    version: 2 as const,
    questions: questions.value.map((item) => item.question),
  }
  return processQuestionResults(bank, answers.value)
})
const clicksEnabled = computed(
  () => phase.value === 'playing' && !celebrating.value && overlay.value == null,
)

const planeSize = computed(() =>
  landscapeVideoDisplaySize(
    viewportSize.value.width,
    viewportSize.value.height,
    videoAspect.value,
  ),
)
const maxPan = computed(() => Math.max(0, planeSize.value.width - viewportSize.value.width))
const planeStyle = computed(() => ({
  width: `${planeSize.value.width}px`,
  height: `${planeSize.value.height}px`,
  transform: `translate3d(${-panX.value}px, 0, 0)`,
}))

function clampPan(value: number): number {
  return Math.min(maxPan.value, Math.max(0, value))
}

function centerPan(): void {
  panX.value = clampPan(maxPan.value / 2 - SEE_INITIAL_PAN_OFFSET_X)
}

function measureStage(): void {
  const box = stage.value?.getBoundingClientRect()
  if (!box) return
  viewportSize.value = { width: box.width, height: box.height }
  if (!didCenterPan && maxPan.value > 0) {
    centerPan()
    didCenterPan = true
    return
  }
  panX.value = clampPan(panX.value)
}

const spotted = computed(() => resolvedIds.value.size)
const totalHazards = computed(() => see.value.hazards.length)
const allSpotted = computed(() => totalHazards.value > 0 && spotted.value >= totalHazards.value)
const passedOnFirstAttempt = computed(
  () =>
    sortedHazards.value.length > 0 &&
    sortedHazards.value.every((hazard) => hitAttempts.value[hazard.id] === 1),
)
const passExplanations = computed(() =>
  sortedHazards.value.map((hazard) => hazard.explanation.trim()).filter(Boolean),
)

function resetSession(): void {
  resolvedIds.value = new Set()
  deferredMissIds.value = new Set()
  passedEndIds.value = new Set()
  trackingHazardId.value = null
  attemptCount.value = 0
  celebrating.value = false
  clipEnded.value = false
  outOfAttemptsCaption.value = false
  overlay.value = null
  deferredMissQueue.value = []
  hitAttempts.value = {}
  clickMarkers.value = []
  answers.value = {}
  currentTime.value = 0
}

watch(
  () => see.value.media?.media_asset_id,
  async (mediaId) => {
    src.value = null
    error.value = null
    phase.value = 'ready'
    resetSession()
    videoAspect.value = 16 / 9
    didCenterPan = false
    panX.value = 0
    if (!mediaId) {
      error.value = 'This scenario has no video yet.'
      return
    }
    try {
      src.value = await services.media.getSignedUrl(mediaId)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load video'
    }
  },
  { immediate: true },
)

function syncTime(): void {
  const time = video.value?.currentTime ?? 0
  currentTime.value = time
  if (phase.value !== 'playing' || celebrating.value || overlay.value) return

  const closed = closedHazardIds(resolvedIds.value, deferredMissIds.value)
  const active = activeHazardAtTime(sortedHazards.value, closed, time)

  if (active) {
    if (trackingHazardId.value !== active.id) {
      if (trackingHazardId.value != null) attemptCount.value = 0
      trackingHazardId.value = active.id
    }
    return
  }

  const trackingId = trackingHazardId.value
  if (trackingId && !passedEndIds.value.has(trackingId)) {
    const tracked = sortedHazards.value.find((hazard) => hazard.id === trackingId)
    if (tracked && time > tracked.endTime) {
      const nextPassed = new Set(passedEndIds.value)
      nextPassed.add(trackingId)
      passedEndIds.value = nextPassed
      deferMiss(trackingId)
    }
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

function begin(): void {
  unlockTapAudio()
  phase.value = 'playing'
  clipEnded.value = false
  void video.value?.play().catch(() => undefined)
  startPlayhead()
}

function closedIds(): Set<string> {
  return closedHazardIds(resolvedIds.value, deferredMissIds.value)
}

function deferMiss(hazardId: string): void {
  if (resolvedIds.value.has(hazardId) || deferredMissIds.value.has(hazardId)) return
  const next = new Set(deferredMissIds.value)
  next.add(hazardId)
  deferredMissIds.value = next
  deferredMissQueue.value = [...deferredMissQueue.value, hazardId]
  trackingHazardId.value = null
  attemptCount.value = 0
}

function openNextDeferredMiss(): boolean {
  const [next, ...rest] = deferredMissQueue.value
  if (!next) return false
  deferredMissQueue.value = rest
  overlay.value = { step: 'missed', hazardId: next }
  video.value?.pause()
  return true
}

function goToResults(): void {
  cancelAnimationFrame(playFrame)
  video.value?.pause()
  overlay.value = null
  celebrating.value = false
  phase.value = 'results'
}

function startQuestionFlow(): void {
  if (!overlay.value) return
  if (overlayQuestions.value.length > 0) {
    overlay.value = { step: 'question', hazardId: overlay.value.hazardId, questionIndex: 0 }
    return
  }
  finishHazard()
}

function finishHazard(): void {
  const hazardId = overlay.value?.hazardId
  overlay.value = null
  celebrating.value = false
  if (hazardId) {
    const nextDeferred = new Set(deferredMissIds.value)
    nextDeferred.delete(hazardId)
    deferredMissIds.value = nextDeferred
    deferredMissQueue.value = deferredMissQueue.value.filter((id) => id !== hazardId)
  }

  if (clipEnded.value) {
    if (openNextDeferredMiss()) return
    goToResults()
    return
  }

  void video.value?.play().catch(() => undefined)
}

function onFeedbackContinue(): void {
  startQuestionFlow()
}

function showOutOfAttemptsCaption(): void {
  outOfAttemptsCaption.value = true
  window.clearTimeout(outOfAttemptsTimer)
  outOfAttemptsTimer = window.setTimeout(() => {
    outOfAttemptsCaption.value = false
  }, OUT_OF_ATTEMPTS_CAPTION_MS)
}

function onTap(clientX: number, clientY: number): void {
  if (!clicksEnabled.value || !video.value) return

  const time = video.value.currentTime
  const { x, y } = clientToPercent(clientX, clientY, video.value)
  const closed = closedIds()
  const target = targetHazardForClick(sortedHazards.value, closed, time)

  const targetAlreadyMissed = target != null && deferredMissIds.value.has(target.id)
  const attemptsUsedOnTarget =
    target != null &&
    trackingHazardId.value === target.id &&
    attemptCount.value >= MAX_HAZARD_ATTEMPTS
  const noOpenTargetAfterExhaustion =
    target == null &&
    (deferredMissIds.value.size > 0 || attemptCount.value >= MAX_HAZARD_ATTEMPTS)

  if (targetAlreadyMissed || attemptsUsedOnTarget || noOpenTargetAfterExhaustion) {
    showOutOfAttemptsCaption()
    return
  }

  const frame = {
    width: video.value.clientWidth,
    height: video.value.clientHeight,
  }
  const activeAtClick = activeHazardAtTime(sortedHazards.value, closed, time)
  const isHit =
    target != null &&
    activeAtClick?.id === target.id &&
    isClickOnHazard({ x, y, time }, target, time, frame)

  let nextAttempts = attemptCount.value
  if (target) {
    if (trackingHazardId.value !== target.id) {
      trackingHazardId.value = target.id
      nextAttempts = 0
    }
    nextAttempts += 1
    attemptCount.value = nextAttempts
  } else if (trackingHazardId.value) {
    nextAttempts = attemptCount.value + 1
    attemptCount.value = nextAttempts
  } else {
    nextAttempts = 1
    attemptCount.value = nextAttempts
  }

  const marker: ClickMarker = {
    id: crypto.randomUUID(),
    x,
    y,
    isHit,
    attempts: Math.min(Math.max(nextAttempts, 1), MAX_HAZARD_ATTEMPTS),
  }
  clickMarkers.value = [...clickMarkers.value, marker]
  const markerDuration = isHit ? HIT_MARKER_DURATION_MS : MARKER_DURATION_MS
  window.setTimeout(() => {
    clickMarkers.value = clickMarkers.value.filter((item) => item.id !== marker.id)
  }, markerDuration)

  if (isHit) {
    playHitTapSound()
  } else {
    playMissTapSound()
  }

  if (!target) return

  if (isHit) {
    celebrating.value = true
    video.value.pause()
    const nextResolved = new Set(resolvedIds.value)
    nextResolved.add(target.id)
    resolvedIds.value = nextResolved
    hitAttempts.value = { ...hitAttempts.value, [target.id]: nextAttempts }
    trackingHazardId.value = null
    attemptCount.value = 0
    window.clearTimeout(hitTimer)
    hitTimer = window.setTimeout(() => {
      hitTimer = 0
      celebrating.value = false
      overlay.value = {
        step: 'success',
        hazardId: target.id,
        attempts: nextAttempts,
      }
    }, CORRECT_HIT_REVEAL_MS)
    return
  }

  if (nextAttempts >= MAX_HAZARD_ATTEMPTS) {
    window.clearTimeout(missTimer)
    missTimer = window.setTimeout(() => {
      missTimer = 0
      deferMiss(target.id)
    }, ENGAGEMENT_DELAY_MS)
  }
}

function onVideoMetadata(): void {
  const el = video.value
  videoAspect.value = videoAspectRatio(el?.videoWidth ?? 0, el?.videoHeight ?? 0)
  didCenterPan = false
  measureStage()
}

function onPointerDown(event: PointerEvent): void {
  if (!clicksEnabled.value || event.button !== 0) return
  pointerPanned = false
  pointerStart = {
    x: event.clientX,
    y: event.clientY,
    pan: panX.value,
    pointerId: event.pointerId,
  }
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  } catch {
    /* synthetic events in tests have no capture */
  }
}

function onPointerMove(event: PointerEvent): void {
  const start = pointerStart
  if (!start || start.pointerId !== event.pointerId) return
  const dx = event.clientX - start.x
  const dy = event.clientY - start.y
  if (!pointerPanned && Math.abs(dx) < VIDEO_PAN_SLOP_PX && Math.abs(dy) < VIDEO_PAN_SLOP_PX) {
    return
  }
  pointerPanned = true
  panX.value = clampPan(start.pan - dx)
}

function onPointerUp(event: PointerEvent): void {
  const start = pointerStart
  const wasPan = pointerPanned
  pointerStart = null
  pointerPanned = false
  if (!start || start.pointerId !== event.pointerId) return
  try {
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  } catch {
    /* already released */
  }
  if (wasPan) return
  onTap(event.clientX, event.clientY)
}

function onPointerCancel(): void {
  pointerStart = null
  pointerPanned = false
}

watch(videoAspect, () => {
  didCenterPan = false
  measureStage()
})

watch(stage, (el) => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!el || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => measureStage())
  resizeObserver.observe(el)
  measureStage()
})

function finishPlayback(): void {
  if (phase.value !== 'playing') return
  clipEnded.value = true
  if (celebrating.value || overlay.value) return
  cancelAnimationFrame(playFrame)
  video.value?.pause()
  if (openNextDeferredMiss()) return
  goToResults()
}

function storeAnswer(question: ProcessSurveyQuestion, answerIndex: number): void {
  answers.value = { ...answers.value, [question.id]: answerIndex }
}

function onQuestionComplete(): void {
  if (overlay.value?.step !== 'question') return
  const next = overlay.value.questionIndex + 1
  if (next >= overlayQuestions.value.length) {
    finishHazard()
    return
  }
  overlay.value = { ...overlay.value, questionIndex: next }
}

onBeforeUnmount(() => {
  cancelAnimationFrame(playFrame)
  window.clearTimeout(outOfAttemptsTimer)
  window.clearTimeout(missTimer)
  window.clearTimeout(hitTimer)
  resizeObserver?.disconnect()
  stopHitTapSound()
  video.value?.pause()
})
</script>

<template>
  <div class="see-experience" :class="{ 'is-results': phase === 'results' }">
    <p v-if="error" class="process-player-message">{{ error }}</p>
    <template v-else-if="src">
      <div v-if="phase !== 'results'" ref="stage" class="see-stage">
        <div
          class="see-video-plane"
          :class="{ 'is-interactive': clicksEnabled }"
          :style="planeStyle"
          role="application"
          aria-label="Tap hazards as they develop"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <video
            ref="video"
            class="see-player-video"
            :src="src"
            playsinline
            preload="auto"
            @loadedmetadata="onVideoMetadata"
            @ended="finishPlayback"
          />
          <div
            v-for="marker in clickMarkers"
            :key="marker.id"
            class="see-click-marker"
            :style="{ left: `${marker.x}%`, top: `${marker.y}%` }"
          >
            <AttemptTouchFeedback :attempts="marker.attempts" :hit="marker.isHit" />
            <ClickConfetti v-if="marker.isHit" />
          </div>
        </div>
        <div
          v-if="outOfAttemptsCaption"
          class="see-out-of-attempts"
          role="status"
          aria-live="polite"
        >
          <p>Out of attempts</p>
        </div>
        <div v-if="phase === 'ready'" class="process-instruction-overlay">
          <ProcessInstructionCard
            text="Watch the following video and tap hazards as they develop."
            tag="See"
            @begin="begin"
          />
        </div>
        <div
          v-if="overlay && (overlay.step === 'success' || overlay.step === 'missed')"
          class="see-feedback-overlay"
        >
          <SeeHazardFeedbackCard
            :key="`${overlay.step}-${overlay.hazardId}`"
            :variant="overlay.step === 'success' ? 'success' : 'missed'"
            :attempts="overlay.step === 'success' ? overlay.attempts : undefined"
            @continue="onFeedbackContinue"
          />
        </div>
        <div v-if="overlay?.step === 'question' && overlayQuestion" class="process-dim-overlay">
          <ProcessSeverityPopover
            v-if="overlayQuestion.kind === 'severity'"
            :question="overlayQuestion"
            @answer="storeAnswer(overlayQuestion, $event)"
            @complete="onQuestionComplete"
          />
          <ProcessTheoryPopover
            v-else
            :question="overlayQuestion"
            @answer="storeAnswer(overlayQuestion, $event)"
            @complete="onQuestionComplete"
          />
        </div>
      </div>

      <SeeResultsPassCard
        v-else-if="passedOnFirstAttempt"
        :explanations="passExplanations"
        @continue="$emit('finished')"
      />
      <div v-else class="process-results-page" role="main" aria-label="See results">
        <p class="process-results-announcement" :class="{ 'is-emphasis': !allSpotted }">
          {{
            totalHazards === 0
              ? 'NO HAZARDS CONFIGURED'
              : allSpotted
                ? 'ALL HAZARDS SPOTTED'
                : 'KEEP SCANNING'
          }}
        </p>
        <p class="see-results-score">
          {{ spotted }} of {{ totalHazards }} hazard{{ totalHazards === 1 ? '' : 's' }} spotted
        </p>
        <ProcessResultsQuestionList v-if="questionResults.length > 0" :results="questionResults" />
        <button type="button" class="process-instruction-begin" @click="$emit('finished')">
          Continue
        </button>
      </div>
    </template>
    <p v-else class="process-player-message">Loading video…</p>
  </div>
</template>
