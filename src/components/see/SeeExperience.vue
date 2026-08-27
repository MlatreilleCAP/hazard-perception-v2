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
import SeeMissedVideoOverlay from '@/components/see/SeeMissedVideoOverlay.vue'
import SeeResultsPassCard from '@/components/see/SeeResultsPassCard.vue'
import { playHitTapSound, playMissTapSound, stopHitTapSound, unlockTapAudio } from '@/lib/audio/tapFeedback'
import {
  clientToPercent,
  landscapeVideoDisplaySize,
  SEE_INITIAL_PAN_OFFSET_X,
  VIDEO_PAN_SLOP_PX,
} from '@/lib/hazards/coordinates'
import {
  ENGAGEMENT_DELAY_MS,
  FIRST_ATTEMPT_RESULTS_DELAY_MS,
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
import { DEFAULT_SEE_INSTRUCTION_PILL } from '@/types/see'

const props = withDefaults(
  defineProps<{
    definition: ActivityDefinition
    /** When true, load the first frame but wait for parent before starting playback. */
    suppressAutoplay?: boolean
  }>(),
  { suppressAutoplay: false },
)

const emit = defineEmits<{
  ready: []
  finished: [
    payload?: {
      spotted: number
      total: number
      hazardResults?: Array<{
        id: string
        correct: boolean
        attempts: number
        identifyRatio: number | null
      }>
    },
  ]
}>()

type Phase = 'ready' | 'playing' | 'results' | 'coaching'

type Overlay =
  | { step: 'success'; hazardId: string; attempts: number }
  | { step: 'missed'; hazardId: string }
  | { step: 'missed-video'; hazardId: string }
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
/** Null until the first frame is ready so layout does not flash the wrong aspect. */
const videoAspect = ref<number | null>(null)
const frameReady = ref(false)
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
const hitAtSeconds = ref<Record<string, number>>({})
const tapAttemptsByHazard = ref<Record<string, number>>({})
const missReasons = ref<Record<string, 'attempts' | 'time'>>({})
const missedVideoUrls = ref<Record<string, string>>({})
const explanationImageUrls = ref<Record<string, string>>({})

let playFrame = 0
let outOfAttemptsTimer = 0
let missTimer = 0
let hitTimer = 0
let didCenterPan = false
let didEmitReady = false
let readyToken = 0
let firstFrameWarmToken = 0
let resizeObserver: ResizeObserver | null = null
let pointerStart: { x: number; y: number; pan: number; pointerId: number } | null = null
let pointerPanned = false

function emitReadyOnce(): void {
  if (didEmitReady) return
  didEmitReady = true
  emit('ready')
}

function waitForAnimationPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function waitForEvent(el: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  if (event === 'loadeddata' && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve()
  }
  if (event === 'seeked' && !el.seeking) {
    return Promise.resolve()
  }
  if (event === 'playing' && !el.paused) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      el.removeEventListener(event, done)
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(done, timeoutMs)
    el.addEventListener(event, done)
  })
}

function configureInlinePlayback(el: HTMLVideoElement): void {
  el.playsInline = true
  el.setAttribute('playsinline', '')
  el.setAttribute('webkit-playsinline', '')
}

async function startPlayback(el: HTMLVideoElement): Promise<boolean> {
  configureInlinePlayback(el)
  try {
    await el.play()
    return true
  } catch {
    // Mobile browsers block unmuted autoplay without a fresh gesture.
  }
  try {
    el.muted = true
    await el.play()
    return true
  } catch {
    return false
  }
}

async function waitForFirstFrame(el: HTMLVideoElement): Promise<void> {
  configureInlinePlayback(el)
  // iOS will not paint a paused frame without muted playback during load.
  el.muted = true
  el.setAttribute('muted', '')

  if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForEvent(el, 'loadeddata', 8000)
  }

  try {
    if (el.currentTime < 0.001) el.currentTime = 0.001
  } catch {
    // Seek can fail before metadata is ready.
  }

  if (el.seeking) {
    await waitForEvent(el, 'seeked', 1500)
  }

  // Force a decoded frame: muted play is allowed without a user gesture on mobile.
  try {
    await el.play()
    await waitForEvent(el, 'playing', 2000)
    await waitForAnimationPaint()
  } catch {
    // Still try to settle on whatever frame is available.
  }

  el.pause()
  try {
    if (el.currentTime > 0.01) {
      el.currentTime = 0.001
      if (el.seeking) await waitForEvent(el, 'seeked', 1500)
    }
  } catch {
    // Keep whatever frame decoded.
  }

  await waitForAnimationPaint()
}

const see = computed(() => readSeeDefinition(props.definition))
const instructionText = computed(() => see.value.instructionText ?? '')
const instructionPill = computed(
  () => see.value.instructionPill?.trim() || DEFAULT_SEE_INSTRUCTION_PILL,
)
const showScenarioInstruction = computed(() => Boolean(instructionText.value.trim()))
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
const missedVideoSrc = computed(() => {
  const current = overlay.value
  if (!current) return null
  if (current.step !== 'missed-video' && current.step !== 'question') return null
  return missedVideoUrls.value[current.hazardId] ?? null
})
const questionResults = computed((): ProcessQuestionResult[] => {
  const bank = {
    version: 2 as const,
    questions: questions.value.map((item) => item.question),
  }
  return processQuestionResults(bank, answers.value)
})
const clicksEnabled = computed(
  () =>
    phase.value === 'playing' &&
    planeReady.value &&
    !celebrating.value &&
    overlay.value == null,
)

const planeSize = computed(() => {
  const aspect = videoAspect.value
  if (aspect == null) {
    return {
      width: Math.max(0, viewportSize.value.width),
      height: Math.max(0, viewportSize.value.height),
    }
  }
  return landscapeVideoDisplaySize(
    viewportSize.value.width,
    viewportSize.value.height,
    aspect,
  )
})
const planeReady = computed(
  () =>
    frameReady.value &&
    videoAspect.value != null &&
    viewportSize.value.width > 0 &&
    viewportSize.value.height > 0,
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
    Object.keys(hitAttempts.value).length > 0 &&
    Object.values(hitAttempts.value).every((attempts) => attempts === 1) &&
    deferredMissIds.value.size === 0,
)
const passExplanations = computed(() =>
  sortedHazards.value
    .filter((hazard) => hitAttempts.value[hazard.id] != null)
    .map((hazard) => hazard.explanation.trim())
    .filter(Boolean),
)
const coachingRequired = computed(
  () =>
    Object.values(hitAttempts.value).some((attempts) => attempts >= 2) &&
    deferredMissIds.value.size === 0,
)
const foundInAttempts = computed(() => {
  const counts = Object.values(hitAttempts.value)
  return counts.length > 0 ? Math.max(...counts) : 1
})
const hazardMissed = computed(
  () => totalHazards.value > 0 && spotted.value === 0,
)
const missReason = computed((): 'attempts' | 'time' => {
  const missedId = sortedHazards.value.find(
    (hazard) => hitAttempts.value[hazard.id] == null,
  )?.id
  if (missedId && missReasons.value[missedId] === 'attempts') return 'attempts'
  return 'time'
})
const missExplanations = computed(() =>
  sortedHazards.value
    .filter((hazard) => hitAttempts.value[hazard.id] == null)
    .map((hazard) => hazard.explanation.trim())
    .filter(Boolean),
)
const missedExplanationImageUrl = computed(() => {
  const missed = sortedHazards.value.find(
    (hazard) => hitAttempts.value[hazard.id] == null && explanationImageUrls.value[hazard.id],
  )
  return missed ? explanationImageUrls.value[missed.id] ?? null : null
})
const postResultsHazardId = computed(() => {
  if (passedOnFirstAttempt.value) return null
  const lateHit = sortedHazards.value.find((hazard) => (hitAttempts.value[hazard.id] ?? 0) >= 2)
  if (lateHit) return lateHit.id
  return sortedHazards.value.find((hazard) => hitAttempts.value[hazard.id] == null)?.id ?? null
})

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
  hitAtSeconds.value = {}
  tapAttemptsByHazard.value = {}
  missReasons.value = {}
  clickMarkers.value = []
  answers.value = {}
  currentTime.value = 0
}

watch(
  () => see.value.media?.media_asset_id,
  async (mediaId) => {
    const token = ++readyToken
    firstFrameWarmToken += 1
    didEmitReady = false
    src.value = null
    error.value = null
    phase.value = 'ready'
    resetSession()
    videoAspect.value = null
    frameReady.value = false
    didCenterPan = false
    panX.value = 0
    if (!mediaId) {
      error.value = 'This scenario has no video yet.'
      emitReadyOnce()
      return
    }
    try {
      const nextSrc = await services.media.getSignedUrl(mediaId)
      if (token !== readyToken) return
      src.value = nextSrc
    } catch (cause) {
      if (token !== readyToken) return
      error.value = cause instanceof Error ? cause.message : 'Failed to load video'
      emitReadyOnce()
    }
  },
  { immediate: true },
)

watch(
  () => sortedHazards.value.map((hazard) => hazard.missedVideo?.media_asset_id ?? '').join(','),
  async () => {
    const next: Record<string, string> = {}
    await Promise.all(
      sortedHazards.value.map(async (hazard) => {
        const mediaId = hazard.missedVideo?.media_asset_id
        if (!mediaId) return
        try {
          next[hazard.id] = await services.media.getSignedUrl(mediaId)
        } catch {
          /* skip unresolved clips */
        }
      }),
    )
    missedVideoUrls.value = next
  },
  { immediate: true },
)

watch(
  () =>
    sortedHazards.value.map((hazard) => hazard.explanationImage?.media_asset_id ?? '').join(','),
  async () => {
    const next: Record<string, string> = {}
    await Promise.all(
      sortedHazards.value.map(async (hazard) => {
        const mediaId = hazard.explanationImage?.media_asset_id
        if (!mediaId) return
        try {
          next[hazard.id] = await services.media.getSignedUrl(mediaId)
        } catch {
          /* skip unresolved stills */
        }
      }),
    )
    explanationImageUrls.value = next
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
  if (!frameReady.value) return
  unlockTapAudio()
  phase.value = 'playing'
  clipEnded.value = false
  const el = video.value
  if (el) {
    configureInlinePlayback(el)
    // Prefer unmuted playback from the Start tap; fall back to muted if blocked.
    el.muted = false
    el.removeAttribute('muted')
    void el.play().catch(() => {
      void startPlayback(el)
    })
  }
  startPlayhead()
}

function closedIds(): Set<string> {
  return closedHazardIds(resolvedIds.value, deferredMissIds.value)
}

function tapsUsedForHazard(hazardId: string): number {
  const recorded = tapAttemptsByHazard.value[hazardId] ?? 0
  const active =
    trackingHazardId.value === hazardId ? attemptCount.value : 0
  return Math.max(recorded, active)
}

function resolveMissReason(hazardId: string): 'attempts' | 'time' {
  return tapsUsedForHazard(hazardId) >= MAX_HAZARD_ATTEMPTS ? 'attempts' : 'time'
}

function deferMiss(hazardId: string, reason?: 'attempts' | 'time'): void {
  if (resolvedIds.value.has(hazardId) || deferredMissIds.value.has(hazardId)) return
  const next = new Set(deferredMissIds.value)
  next.add(hazardId)
  deferredMissIds.value = next
  deferredMissQueue.value = [...deferredMissQueue.value, hazardId]
  missReasons.value = {
    ...missReasons.value,
    [hazardId]: reason ?? resolveMissReason(hazardId),
  }
  trackingHazardId.value = null
  attemptCount.value = 0
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
  if (overlay.value.step === 'question') return
  const hazardId = overlay.value.hazardId
  if (overlayQuestions.value.length > 0) {
    overlay.value = { step: 'question', hazardId, questionIndex: 0 }
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

  if (phase.value === 'coaching') {
    emitFinished()
    return
  }

  if (clipEnded.value) {
    markUnspottedHazardsMissed()
    goToResults()
    return
  }

  const el = video.value
  if (el) void startPlayback(el)
}

function emitFinished(): void {
  emit('finished', {
    spotted: spotted.value,
    total: totalHazards.value,
    hazardResults: sortedHazards.value.map((hazard) => {
      const correct = resolvedIds.value.has(hazard.id)
      const attempts = hitAttempts.value[hazard.id] ?? 0
      const hitAt = hitAtSeconds.value[hazard.id]
      const visibleDuration = Math.max(0.001, hazard.endTime - hazard.startTime)
      let identifyRatio: number | null = null
      if (correct && typeof hitAt === 'number') {
        const delay = Math.max(0, hitAt - hazard.startTime)
        identifyRatio = Math.min(1, delay / visibleDuration)
      }
      return {
        id: hazard.id,
        correct,
        attempts,
        identifyRatio,
      }
    }),
  })
}

function onResultsContinue(): void {
  const hazardId = postResultsHazardId.value
  if (!hazardId) {
    emitFinished()
    return
  }
  const hazard = sortedHazards.value.find((item) => item.id === hazardId)
  const hasVideo = Boolean(missedVideoUrls.value[hazardId])
  const hasQuestions = hazard ? configuredSurveyQuestions(hazard.questions).length > 0 : false
  if (hasVideo) {
    overlay.value = { step: 'missed-video', hazardId }
    phase.value = 'coaching'
    return
  }
  if (hasQuestions) {
    overlay.value = { step: 'question', hazardId, questionIndex: 0 }
    phase.value = 'coaching'
    return
  }
  emitFinished()
}

function onFeedbackContinue(): void {
  if (overlay.value?.step === 'missed') {
    const url = missedVideoUrls.value[overlay.value.hazardId]
    if (url) {
      overlay.value = { step: 'missed-video', hazardId: overlay.value.hazardId }
      return
    }
  }
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
  syncTime()
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
    tapAttemptsByHazard.value = {
      ...tapAttemptsByHazard.value,
      [target.id]: nextAttempts,
    }
  } else if (trackingHazardId.value) {
    nextAttempts = attemptCount.value + 1
    attemptCount.value = nextAttempts
    tapAttemptsByHazard.value = {
      ...tapAttemptsByHazard.value,
      [trackingHazardId.value]: nextAttempts,
    }
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
  const markerDuration = isHit ? FIRST_ATTEMPT_RESULTS_DELAY_MS + 250 : MARKER_DURATION_MS
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
    hitAtSeconds.value = { ...hitAtSeconds.value, [target.id]: time }
    trackingHazardId.value = null
    attemptCount.value = 0
    window.clearTimeout(hitTimer)
    hitTimer = window.setTimeout(() => {
      hitTimer = 0
      celebrating.value = false
      goToResults()
    }, FIRST_ATTEMPT_RESULTS_DELAY_MS)
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
  if (!el) return
  const width = el.videoWidth
  const height = el.videoHeight
  if (!width || !height) return
  if (frameReady.value) return

  const aspect = width / height
  videoAspect.value = aspect
  didCenterPan = false
  measureStage()

  const token = readyToken
  const warmToken = ++firstFrameWarmToken
  void (async () => {
    await waitForFirstFrame(el)
    if (token !== readyToken || warmToken !== firstFrameWarmToken) return

    measureStage()
    await waitForAnimationPaint()
    if (token !== readyToken || warmToken !== firstFrameWarmToken) return

    requestAnimationFrame(() => {
      if (token !== readyToken || warmToken !== firstFrameWarmToken) return
      measureStage()
      frameReady.value = true
      emitReadyOnce()
      if (phase.value === 'ready' && !instructionText.value.trim() && !props.suppressAutoplay) {
        begin()
      }
    })
  })()
}

watch(
  () => props.suppressAutoplay,
  (suppressed) => {
    if (suppressed) return
    if (phase.value === 'ready' && frameReady.value && !instructionText.value.trim()) {
      begin()
    }
  },
)

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

function markUnspottedHazardsMissed(): void {
  for (const hazard of sortedHazards.value) {
    if (!resolvedIds.value.has(hazard.id)) deferMiss(hazard.id)
  }
}

function finishPlayback(): void {
  if (phase.value !== 'playing') return
  clipEnded.value = true
  if (celebrating.value || overlay.value) return
  cancelAnimationFrame(playFrame)
  video.value?.pause()
  markUnspottedHazardsMissed()
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
  readyToken += 1
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
      <div v-if="phase === 'coaching'" class="see-stage">
        <SeeMissedVideoOverlay
          v-if="missedVideoSrc && (overlay?.step === 'missed-video' || overlay?.step === 'question')"
          :key="overlay?.hazardId"
          :src="missedVideoSrc"
          :instruction-text="overlayHazard?.instructionText ?? ''"
          :instruction-pill="overlayHazard?.instructionPill ?? DEFAULT_SEE_INSTRUCTION_PILL"
          :hold-end="overlay?.step === 'question'"
          @continue="startQuestionFlow"
        />
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
      <div
        v-else-if="phase === 'ready' || phase === 'playing'"
        ref="stage"
        class="see-stage"
      >
        <div
          class="see-video-plane"
          :class="{ 'is-interactive': clicksEnabled, 'is-layout-ready': planeReady }"
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
            muted
            preload="auto"
            webkit-playsinline
            @loadedmetadata="onVideoMetadata"
            @loadeddata="onVideoMetadata"
            @timeupdate="syncTime"
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
        <div v-if="phase === 'ready' && frameReady && showScenarioInstruction" class="process-instruction-overlay">
          <ProcessInstructionCard
            :text="instructionText"
            :tag="instructionPill"
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
        <SeeMissedVideoOverlay
          v-if="missedVideoSrc && (overlay?.step === 'missed-video' || overlay?.step === 'question')"
          :key="overlay?.hazardId"
          :src="missedVideoSrc"
          :instruction-text="overlayHazard?.instructionText ?? ''"
          :instruction-pill="overlayHazard?.instructionPill ?? DEFAULT_SEE_INSTRUCTION_PILL"
          :hold-end="overlay?.step === 'question'"
          @continue="startQuestionFlow"
        />
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
        variant="passed"
        :attempts="foundInAttempts"
        :explanations="passExplanations"
        @continue="emitFinished"
      />
      <SeeResultsPassCard
        v-else-if="coachingRequired"
        variant="coaching"
        :attempts="foundInAttempts"
        :explanations="passExplanations"
        @continue="onResultsContinue"
      />
      <SeeResultsPassCard
        v-else-if="hazardMissed"
        variant="missed"
        :miss-reason="missReason"
        :image-src="missedExplanationImageUrl"
        :explanations="missExplanations"
        @continue="onResultsContinue"
      />
      <div v-else class="process-results-page" role="main" aria-label="Observe results">
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
        <button type="button" class="process-instruction-begin" @click="emitFinished">
          Continue
        </button>
      </div>
    </template>
    <div v-else class="see-stage" aria-busy="true" aria-label="Loading video" />
  </div>
</template>
