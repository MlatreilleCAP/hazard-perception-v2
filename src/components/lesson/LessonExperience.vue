<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readLessonDefinition } from '@/activities/lessonDefinition'
import { services } from '@/app/container'
import { cloneJson } from '@/app/clone'
import AnticipateExperience from '@/components/anticipate/AnticipateExperience.vue'
import LessonResultsCard from '@/components/lesson/LessonResultsCard.vue'
import ProcessExperience from '@/components/process/ProcessExperience.vue'
import ProcessResultsLottie from '@/components/process/ProcessResultsLottie.vue'
import ProcessVideoStage from '@/components/process/ProcessVideoStage.vue'
import SeeExperience from '@/components/see/SeeExperience.vue'
import segmentLoadAnimation from '@/assets/lottie/lesson-segment-load.json'
import {
  collectLessonWarmTargets,
  signAndWarmLessonMedia,
} from '@/lib/lesson/preloadLessonMedia'
import { MediaWarmPool } from '@/lib/media/warmMedia'
import type { ActivityDefinition } from '@/types/activity'
import {
  buildLessonResultsModel,
  buildObserveMetrics,
  hasSeenLessonIntro,
  markLessonIntroSeen,
  orderedInroadsCompositionItems,
  type LessonCompositionItem,
  type LessonSectionResult,
} from '@/types/lesson'

const props = withDefaults(
  defineProps<{
    definition: ActivityDefinition
    /** Studio preview loads draft section snapshots; learners use published. */
    preview?: boolean
  }>(),
  { preview: false },
)

const emit = defineEmits<{
  finished: []
}>()

type Phase = 'intro' | 'playing' | 'results' | 'error'

const phase = ref<Phase>('playing')
const error = ref<string | null>(null)
const introSrc = ref<string | null>(null)
const sectionIndex = ref(0)
const sectionDefinition = ref<ActivityDefinition | null>(null)
const sectionCache = ref<Map<string, ActivityDefinition>>(new Map())
const awaitingReady = ref(false)

const sectionResults = ref<
  Partial<Record<'see' | 'process' | 'anticipate', LessonSectionResult>>
>({})

let loadGeneration = 0
let readyDismissTimer = 0
let loaderShownAt = 0
let warmPool = new MediaWarmPool()
let preloadAbort: AbortController | null = null
let nextWarmPool = new MediaWarmPool()
let nextWarmAbort: AbortController | null = null
let nextWarmIndex: number | null = null
let nextWarmPromise: Promise<void> | null = null
let nextWarmReady = false

const MIN_SECTION_PRELOAD_MS = 700

const lesson = computed(() => readLessonDefinition(props.definition))
const orderedItems = computed(() =>
  orderedInroadsCompositionItems(lesson.value.composition).filter(
    (item) =>
      item.kind === 'see' || item.kind === 'process' || item.kind === 'anticipate',
  ),
)
const currentItem = computed(
  (): LessonCompositionItem | null => orderedItems.value[sectionIndex.value] ?? null,
)
const resultsModel = computed(() =>
  buildLessonResultsModel(props.definition.metadata.title, sectionResults.value),
)

function clearReadyDismissTimer(): void {
  window.clearTimeout(readyDismissTimer)
  readyDismissTimer = 0
}

function showSegmentLoader(): void {
  clearReadyDismissTimer()
  loaderShownAt = performance.now()
  awaitingReady.value = true
  readyDismissTimer = window.setTimeout(() => {
    awaitingReady.value = false
  }, 15000)
}

function onSegmentReady(): void {
  clearReadyDismissTimer()
  const remaining = MIN_SECTION_PRELOAD_MS - (performance.now() - loaderShownAt)
  if (remaining <= 0) {
    awaitingReady.value = false
  } else {
    readyDismissTimer = window.setTimeout(() => {
      awaitingReady.value = false
    }, remaining)
  }
  if (phase.value !== 'error') {
    void warmUpcomingSection(loadGeneration)
  }
}

function disposeCurrentPool(): void {
  preloadAbort?.abort()
  preloadAbort = null
  warmPool.dispose()
}

function disposeNextPool(): void {
  nextWarmAbort?.abort()
  nextWarmAbort = null
  nextWarmPromise = null
  nextWarmIndex = null
  nextWarmReady = false
  nextWarmPool.dispose()
}

function disposeWarmPool(): void {
  disposeCurrentPool()
  disposeNextPool()
}

function resetWarmPool(): void {
  disposeCurrentPool()
  warmPool = new MediaWarmPool()
}

function upcomingSectionIndex(): number | null {
  if (phase.value === 'intro') {
    return orderedItems.value.length > 0 ? 0 : null
  }
  if (phase.value !== 'playing') return null
  const next = sectionIndex.value + 1
  return next < orderedItems.value.length ? next : null
}

async function warmUpcomingSection(generation: number): Promise<void> {
  const nextIndex = upcomingSectionIndex()
  if (nextIndex == null || generation !== loadGeneration) return
  if (nextWarmIndex === nextIndex && nextWarmPromise) return

  disposeNextPool()
  nextWarmPool = new MediaWarmPool()
  nextWarmIndex = nextIndex
  nextWarmAbort = new AbortController()
  const item = orderedItems.value[nextIndex]
  if (!item) return

  const signal = nextWarmAbort.signal
  nextWarmPromise = (async () => {
    const definition = await loadSectionDefinition(item)
    if (generation !== loadGeneration || signal.aborted) return
    await signAndWarmLessonMedia({
      targets: collectLessonWarmTargets(null, [{ kind: item.kind, definition }]),
      getSignedUrl: (mediaId) => services.media.getSignedUrl(mediaId),
      pool: nextWarmPool,
      signal,
    })
    if (generation !== loadGeneration || signal.aborted) return
    nextWarmReady = true
  })()
}

async function adoptWarmedSection(index: number): Promise<boolean> {
  if (nextWarmIndex !== index || !nextWarmReady) return false

  disposeCurrentPool()
  warmPool = nextWarmPool
  nextWarmPool = new MediaWarmPool()
  nextWarmAbort = null
  nextWarmPromise = null
  nextWarmIndex = null
  nextWarmReady = false
  return true
}

async function warmCurrentTargets(
  generation: number,
  introMediaId: string | null,
  sections: Array<{
    kind: LessonCompositionItem['kind']
    definition: ActivityDefinition
  }>,
): Promise<void> {
  if (generation !== loadGeneration) return
  resetWarmPool()
  preloadAbort = new AbortController()
  await signAndWarmLessonMedia({
    targets: collectLessonWarmTargets(introMediaId, sections),
    getSignedUrl: (mediaId) => services.media.getSignedUrl(mediaId),
    pool: warmPool,
    signal: preloadAbort.signal,
  })
}

function shouldPlayIntro(): boolean {
  if (!lesson.value.introMedia?.media_asset_id) return false
  if (lesson.value.introShowOnFirstVisitOnly === false) return true
  return !hasSeenLessonIntro(props.definition.id)
}

async function loadSectionDefinition(item: LessonCompositionItem): Promise<ActivityDefinition> {
  const cached = sectionCache.value.get(item.refId)
  if (cached) return cloneJson(cached)

  const loadSection = props.preview
    ? services.persistence.getById.bind(services.persistence)
    : services.persistence.getPublished.bind(services.persistence)
  const loaded = await loadSection(item.refId)
  if (!loaded) {
    throw new Error(`${item.title} could not be loaded.`)
  }
  const definition = cloneJson(loaded)
  sectionCache.value.set(item.refId, definition)
  return definition
}

async function startIntro(): Promise<boolean> {
  if (!shouldPlayIntro()) return false
  const mediaId = lesson.value.introMedia?.media_asset_id
  if (!mediaId) return false

  const generation = loadGeneration
  showSegmentLoader()
  sectionDefinition.value = null
  introSrc.value = null
  error.value = null

  try {
    await warmCurrentTargets(generation, mediaId, [])
    if (generation !== loadGeneration) return true
    introSrc.value = await services.media.getSignedUrl(mediaId)
    phase.value = 'intro'
    return true
  } catch (cause) {
    if (generation !== loadGeneration) return true
    error.value = cause instanceof Error ? cause.message : 'Failed to load intro video'
    phase.value = 'error'
    onSegmentReady()
    return true
  }
}

async function enterSection(index: number): Promise<void> {
  const item = orderedItems.value[index]
  if (!item) {
    onSegmentReady()
    phase.value = 'results'
    sectionDefinition.value = null
    return
  }

  const generation = loadGeneration
  showSegmentLoader()
  sectionDefinition.value = null
  introSrc.value = null
  error.value = null

  try {
    const definition = await loadSectionDefinition(item)
    if (generation !== loadGeneration) return
    const adopted = await adoptWarmedSection(index)
    if (generation !== loadGeneration) return
    if (!adopted) {
      await warmCurrentTargets(generation, null, [{ kind: item.kind, definition }])
      if (generation !== loadGeneration) return
    }
    warmPool.releaseDecoders()
    sectionDefinition.value = definition
    sectionIndex.value = index
    phase.value = 'playing'
  } catch (cause) {
    if (generation !== loadGeneration) return
    error.value = cause instanceof Error ? cause.message : 'Failed to load lesson section'
    phase.value = 'error'
    onSegmentReady()
  }
}

function onIntroEnded(): void {
  if (lesson.value.introShowOnFirstVisitOnly !== false) {
    markLessonIntroSeen(props.definition.id)
  }
  if (orderedItems.value.length === 0) {
    introSrc.value = null
    emit('finished')
    return
  }
  // Leave intro immediately so the last frame cannot stick over the Observe loader.
  showSegmentLoader()
  introSrc.value = null
  sectionDefinition.value = null
  phase.value = 'playing'
  void enterSection(0)
}

async function startLesson(): Promise<void> {
  loadGeneration += 1
  clearReadyDismissTimer()
  disposeWarmPool()
  warmPool = new MediaWarmPool()
  nextWarmPool = new MediaWarmPool()
  sectionResults.value = {}
  sectionIndex.value = 0
  introSrc.value = null
  sectionDefinition.value = null
  sectionCache.value = new Map()
  error.value = null
  showSegmentLoader()

  if (orderedItems.value.length === 0) {
    const showingIntro = await startIntro()
    if (showingIntro || phase.value === 'error') return
    error.value = 'This lesson has no Observe, Process, or Anticipate sections yet.'
    phase.value = 'error'
    onSegmentReady()
    return
  }

  const showingIntro = await startIntro()
  if (showingIntro || phase.value === 'error') return
  await enterSection(0)
}

function advanceToNextSection(): void {
  void enterSection(sectionIndex.value + 1)
}

function onSeeFinished(payload?: {
  spotted: number
  total: number
  hazardResults?: Array<{
    id: string
    correct: boolean
    attempts: number
    identifyRatio: number | null
  }>
}): void {
  const hazards = payload?.hazardResults ?? []
  const spotted = payload?.spotted ?? 0
  const total = payload?.total ?? 0
  sectionResults.value = {
    ...sectionResults.value,
    see: {
      kind: 'see',
      spotted,
      total,
      hazards,
      metrics: buildObserveMetrics(hazards, spotted, total),
    },
  }
  advanceToNextSection()
}

function onProcessFinished(payload?: {
  percent: number
  correctCount: number
  totalCount: number
  coachingRequired?: boolean
  questionResults?: Array<{ id: string; label: string; correct: boolean }>
}): void {
  sectionResults.value = {
    ...sectionResults.value,
    process: {
      kind: 'process',
      percent: payload?.percent ?? 0,
      correctCount: payload?.correctCount ?? 0,
      totalCount: payload?.totalCount ?? 0,
      coachingRequired: payload?.coachingRequired === true,
      metrics: (payload?.questionResults ?? []).map((item, index) => ({
        id: item.id,
        label: `Q${index + 1}`,
        status: item.correct ? 'pass' : 'fail',
      })),
    },
  }
  advanceToNextSection()
}

function onAnticipateFinished(payload?: {
  percent: number
  correctCount: number
  totalCount: number
  coachingRequired?: boolean
  questionResults?: Array<{ id: string; label: string; correct: boolean }>
}): void {
  sectionResults.value = {
    ...sectionResults.value,
    anticipate: {
      kind: 'anticipate',
      percent: payload?.percent ?? 0,
      correctCount: payload?.correctCount ?? 0,
      totalCount: payload?.totalCount ?? 0,
      coachingRequired: payload?.coachingRequired === true,
      metrics: (payload?.questionResults ?? []).map((item, index) => ({
        id: item.id,
        label: `Q${index + 1}`,
        status: item.correct ? 'pass' : 'fail',
      })),
    },
  }
  advanceToNextSection()
}

onMounted(() => {
  void startLesson()
})

watch(
  () => props.definition.id,
  () => {
    void startLesson()
  },
)

onBeforeUnmount(() => {
  loadGeneration += 1
  clearReadyDismissTimer()
  disposeWarmPool()
})
</script>

<template>
  <div
    class="lesson-experience"
    :class="{
      'is-results': phase === 'results',
      'is-loading': awaitingReady,
    }"
  >
    <div
      v-if="awaitingReady"
      class="lesson-preloader"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <div class="lesson-preloader-lottie" aria-hidden="true">
        <ProcessResultsLottie :animation-data="segmentLoadAnimation" loop />
      </div>
    </div>
    <p v-if="phase === 'error'" class="process-player-message">{{ error }}</p>
    <ProcessVideoStage
      v-else-if="phase === 'intro' && introSrc"
      class="lesson-intro-cover"
      :src="introSrc"
      instruction-text=""
      @ready="onSegmentReady"
      @ended="onIntroEnded"
    />
    <template v-else-if="phase === 'playing' && sectionDefinition && currentItem">
      <SeeExperience
        v-if="currentItem.kind === 'see'"
        :key="sectionDefinition.id"
        :definition="sectionDefinition"
        @ready="onSegmentReady"
        @finished="onSeeFinished"
      />
      <ProcessExperience
        v-else-if="currentItem.kind === 'process'"
        :key="sectionDefinition.id"
        :definition="sectionDefinition"
        @ready="onSegmentReady"
        @finished="onProcessFinished"
      />
      <AnticipateExperience
        v-else-if="currentItem.kind === 'anticipate'"
        :key="sectionDefinition.id"
        :definition="sectionDefinition"
        @ready="onSegmentReady"
        @finished="onAnticipateFinished"
      />
    </template>
    <LessonResultsCard
      v-if="phase === 'results'"
      :title="resultsModel.title"
      :percent="resultsModel.percent"
      :passed="resultsModel.passed"
      :sections="resultsModel.sections"
      @continue="emit('finished')"
    />
  </div>
</template>
