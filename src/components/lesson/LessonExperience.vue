<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readLessonDefinition } from '@/activities/lessonDefinition'
import { cloneJson } from '@/app/clone'
import AnticipateExperience from '@/components/anticipate/AnticipateExperience.vue'
import LessonResultsCard from '@/components/lesson/LessonResultsCard.vue'
import ProcessExperience from '@/components/process/ProcessExperience.vue'
import ProcessResultsLottie from '@/components/process/ProcessResultsLottie.vue'
import ProcessVideoStage from '@/components/process/ProcessVideoStage.vue'
import SeeExperience from '@/components/see/SeeExperience.vue'
import preloadAnimation from '@/assets/lottie/lesson-preload.json'
import {
  preloadIntroMedia,
  preloadLessonSection,
  releaseLessonPreloadRetain,
  sectionPreloadLabel,
  type LessonPreloadProgress,
  type LessonPreloadResult,
} from '@/lib/lesson/preloadLessonAssets'
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

type Phase = 'preloading' | 'intro' | 'playing' | 'results' | 'error'

const phase = ref<Phase>('preloading')
const error = ref<string | null>(null)
const introSrc = ref<string | null>(null)
const sectionIndex = ref(0)
const sectionDefinition = ref<ActivityDefinition | null>(null)
const sectionCache = ref<Map<string, ActivityDefinition>>(new Map())
const preloadProgress = ref<LessonPreloadProgress>({
  loaded: 0,
  total: 1,
  label: 'Loading…',
})
const awaitingSectionReady = ref(false)

let preloadRetain: Array<HTMLVideoElement | HTMLImageElement> = []
let preloadGeneration = 0
let preloaderDismissTimer = 0
let preloadLottieCycleDone = false
let preloadLottieWaiters: Array<() => void> = []

const preloadLottieDurationMs = (() => {
  const data = preloadAnimation as { fr?: number; ip?: number; op?: number }
  const fr = data.fr && data.fr > 0 ? data.fr : 60
  const ip = typeof data.ip === 'number' ? data.ip : 0
  const op = typeof data.op === 'number' ? data.op : fr * 2
  return Math.max(500, Math.round(((op - ip) / fr) * 1000))
})()

const sectionResults = ref<
  Partial<Record<'see' | 'process' | 'anticipate', LessonSectionResult>>
>({})

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

function resetPreloadLottieGate(): void {
  const waiters = preloadLottieWaiters
  preloadLottieWaiters = []
  preloadLottieCycleDone = false
  for (const resolve of waiters) resolve()
}

function onPreloadLottieComplete(): void {
  if (preloadLottieCycleDone) return
  preloadLottieCycleDone = true
  const waiters = preloadLottieWaiters
  preloadLottieWaiters = []
  for (const resolve of waiters) resolve()
}

function waitForPreloadLottieCycle(): Promise<void> {
  if (preloadLottieCycleDone) return Promise.resolve()
  return new Promise((resolve) => {
    preloadLottieWaiters.push(resolve)
    window.setTimeout(() => {
      onPreloadLottieComplete()
    }, preloadLottieDurationMs + 400)
  })
}

function clearPreloaderDismissTimer(): void {
  window.clearTimeout(preloaderDismissTimer)
  preloaderDismissTimer = 0
}

function dismissSectionCover(): void {
  clearPreloaderDismissTimer()
  awaitingSectionReady.value = false
}

function armSectionCoverFallback(): void {
  clearPreloaderDismissTimer()
  preloaderDismissTimer = window.setTimeout(() => {
    dismissSectionCover()
  }, 12000)
}

function clearPreloadRetain(): void {
  releaseLessonPreloadRetain(preloadRetain)
  preloadRetain = []
}

function shouldPlayIntro(): boolean {
  if (!lesson.value.introMedia?.media_asset_id) return false
  if (lesson.value.introShowOnFirstVisitOnly === false) return true
  return !hasSeenLessonIntro(props.definition.id)
}

function applyPreloadResult(result: LessonPreloadResult): void {
  releaseLessonPreloadRetain(preloadRetain)
  preloadRetain = result.retain
  for (const [id, definition] of result.sections) {
    sectionCache.value.set(id, definition)
  }
}

function showPlaying(index: number): void {
  const item = orderedItems.value[index]
  if (!item) {
    dismissSectionCover()
    phase.value = 'results'
    sectionDefinition.value = null
    return
  }
  const cached = sectionCache.value.get(item.refId)
  if (!cached) {
    error.value = `${item.title} could not be loaded.`
    phase.value = 'error'
    dismissSectionCover()
    return
  }

  awaitingSectionReady.value = true
  armSectionCoverFallback()
  sectionDefinition.value = cloneJson(cached)
  sectionIndex.value = index
  phase.value = 'playing'
}

async function runIntroPreload(): Promise<boolean> {
  const mediaId = lesson.value.introMedia?.media_asset_id
  if (!shouldPlayIntro() || !mediaId) return false

  const generation = preloadGeneration
  phase.value = 'preloading'
  sectionDefinition.value = null
  introSrc.value = null
  error.value = null
  resetPreloadLottieGate()
  preloadProgress.value = { loaded: 0, total: 1, label: 'Loading intro…' }

  try {
    const intro = await preloadIntroMedia({
      mediaId,
      label: 'Loading intro…',
      onProgress: (progress) => {
        if (generation !== preloadGeneration) return
        preloadProgress.value = progress
      },
    })

    if (generation !== preloadGeneration) {
      releaseLessonPreloadRetain(intro.retain)
      return false
    }

    await waitForPreloadLottieCycle()
    if (generation !== preloadGeneration) {
      releaseLessonPreloadRetain(intro.retain)
      return false
    }

    releaseLessonPreloadRetain(preloadRetain)
    preloadRetain = intro.retain
    introSrc.value = intro.src
    phase.value = 'intro'
    return true
  } catch (cause) {
    if (generation !== preloadGeneration) return false
    error.value = cause instanceof Error ? cause.message : 'Failed to load intro video'
    phase.value = 'error'
    return false
  }
}

async function enterSection(index: number): Promise<void> {
  const item = orderedItems.value[index]
  if (!item) {
    dismissSectionCover()
    phase.value = 'results'
    sectionDefinition.value = null
    return
  }

  if (sectionCache.value.has(item.refId)) {
    showPlaying(index)
    return
  }

  const generation = preloadGeneration
  const label = sectionPreloadLabel(item.kind)
  phase.value = 'preloading'
  sectionDefinition.value = null
  introSrc.value = null
  error.value = null
  resetPreloadLottieGate()
  preloadProgress.value = { loaded: 0, total: 1, label }

  try {
    const result = await preloadLessonSection({
      item,
      published: !props.preview,
      label,
      onProgress: (progress) => {
        if (generation !== preloadGeneration) return
        preloadProgress.value = progress
      },
    })

    await waitForPreloadLottieCycle()

    if (generation !== preloadGeneration) {
      releaseLessonPreloadRetain(result.retain)
      return
    }

    applyPreloadResult(result)
    showPlaying(index)
  } catch (cause) {
    if (generation !== preloadGeneration) return
    error.value = cause instanceof Error ? cause.message : 'Failed to load lesson section'
    phase.value = 'error'
    dismissSectionCover()
  }
}

function onIntroEnded(): void {
  if (lesson.value.introShowOnFirstVisitOnly !== false) {
    markLessonIntroSeen(props.definition.id)
  }
  introSrc.value = null
  void enterSection(0)
}

function onSectionReady(): void {
  dismissSectionCover()
}

async function startLesson(): Promise<void> {
  preloadGeneration += 1
  clearPreloadRetain()
  clearPreloaderDismissTimer()
  dismissSectionCover()
  sectionResults.value = {}
  sectionIndex.value = 0
  introSrc.value = null
  sectionDefinition.value = null
  sectionCache.value = new Map()
  error.value = null

  if (orderedItems.value.length === 0) {
    error.value = 'This lesson has no Observe, Process, or Anticipate sections yet.'
    phase.value = 'error'
    return
  }

  const showingIntro = await runIntroPreload()
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
  questionResults?: Array<{ id: string; label: string; correct: boolean }>
}): void {
  sectionResults.value = {
    ...sectionResults.value,
    process: {
      kind: 'process',
      percent: payload?.percent ?? 0,
      correctCount: payload?.correctCount ?? 0,
      totalCount: payload?.totalCount ?? 0,
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
  questionResults?: Array<{ id: string; label: string; correct: boolean }>
}): void {
  sectionResults.value = {
    ...sectionResults.value,
    anticipate: {
      kind: 'anticipate',
      percent: payload?.percent ?? 0,
      correctCount: payload?.correctCount ?? 0,
      totalCount: payload?.totalCount ?? 0,
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
  preloadGeneration += 1
  clearPreloaderDismissTimer()
  dismissSectionCover()
  clearPreloadRetain()
})
</script>

<template>
  <div
    class="lesson-experience"
    :class="{
      'is-results': phase === 'results',
      'is-preloading': phase === 'preloading',
    }"
  >
    <div
      v-if="phase === 'preloading'"
      class="lesson-preloader"
      role="status"
      aria-live="polite"
      aria-busy="true"
      :aria-label="preloadProgress.label"
    >
      <p class="lesson-preloader-label">{{ preloadProgress.label }}</p>
      <div class="lesson-preloader-lottie" aria-hidden="true">
        <ProcessResultsLottie
          :animation-data="preloadAnimation"
          loop
          @complete="onPreloadLottieComplete"
        />
      </div>
    </div>
    <p v-if="phase === 'error'" class="process-player-message">{{ error }}</p>
    <ProcessVideoStage
      v-else-if="phase === 'intro' && introSrc"
      class="lesson-intro-cover"
      :src="introSrc"
      instruction-text=""
      @ended="onIntroEnded"
    />
    <template v-else-if="phase === 'playing' && sectionDefinition && currentItem">
      <div
        v-if="awaitingSectionReady"
        class="lesson-preloader is-overlay"
        role="status"
        aria-live="polite"
        aria-busy="true"
        :aria-label="sectionPreloadLabel(currentItem.kind)"
      >
        <p class="lesson-preloader-label">{{ sectionPreloadLabel(currentItem.kind) }}</p>
        <div class="lesson-preloader-lottie" aria-hidden="true">
          <ProcessResultsLottie :animation-data="preloadAnimation" loop />
        </div>
      </div>
      <SeeExperience
        v-if="currentItem.kind === 'see'"
        :key="sectionDefinition.id"
        :definition="sectionDefinition"
        @ready="onSectionReady"
        @finished="onSeeFinished"
      />
      <ProcessExperience
        v-else-if="currentItem.kind === 'process'"
        :key="sectionDefinition.id"
        :definition="sectionDefinition"
        @ready="onSectionReady"
        @finished="onProcessFinished"
      />
      <AnticipateExperience
        v-else-if="currentItem.kind === 'anticipate'"
        :key="sectionDefinition.id"
        :definition="sectionDefinition"
        @ready="onSectionReady"
        @finished="onAnticipateFinished"
      />
    </template>
    <LessonResultsCard
      v-if="phase === 'results'"
      :title="resultsModel.title"
      :percent="resultsModel.percent"
      :passed="resultsModel.passed"
      :summary="resultsModel.summary"
      :sections="resultsModel.sections"
      @continue="emit('finished')"
    />
  </div>
</template>
