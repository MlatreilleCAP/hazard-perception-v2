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
import preloadAnimation from '@/assets/lottie/lesson-preload.json'
import {
  preloadLessonAssets,
  releaseLessonPreloadRetain,
  type LessonPreloadProgress,
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

const props = defineProps<{
  definition: ActivityDefinition
}>()

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
let preloadRetain: Array<HTMLVideoElement | HTMLImageElement> = []
let preloadGeneration = 0

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

function clearPreloadRetain(): void {
  releaseLessonPreloadRetain(preloadRetain)
  preloadRetain = []
}

function shouldPlayIntro(): boolean {
  if (!lesson.value.introMedia?.media_asset_id) return false
  if (lesson.value.introShowOnFirstVisitOnly === false) return true
  return !hasSeenLessonIntro(props.definition.id)
}

function showPlaying(index: number): void {
  const item = orderedItems.value[index]
  if (!item) {
    phase.value = 'results'
    sectionDefinition.value = null
    return
  }
  const cached = sectionCache.value.get(item.refId)
  if (!cached) {
    error.value = `${item.title} could not be loaded.`
    phase.value = 'error'
    return
  }
  sectionDefinition.value = cloneJson(cached)
  sectionIndex.value = index
  phase.value = 'playing'
}

async function playIntroIfNeeded(): Promise<boolean> {
  if (!shouldPlayIntro()) return false
  const mediaId = lesson.value.introMedia?.media_asset_id
  if (!mediaId) return false
  try {
    introSrc.value = await services.media.getSignedUrl(mediaId)
    phase.value = 'intro'
    return true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load intro video'
    phase.value = 'error'
    return true
  }
}

/**
 * Warm media for one content step, then enter it.
 * Index 0 also warms the intro (when shown) together with Observe.
 */
async function preloadAndEnter(index: number): Promise<void> {
  const item = orderedItems.value[index]
  if (!item) {
    phase.value = 'results'
    sectionDefinition.value = null
    return
  }

  const generation = preloadGeneration
  phase.value = 'preloading'
  error.value = null
  sectionDefinition.value = null
  introSrc.value = null
  clearPreloadRetain()
  preloadProgress.value = { loaded: 0, total: 1, label: 'Loading…' }

  const includeIntro = index === 0 && shouldPlayIntro()
  const label =
    index === 0
      ? includeIntro
        ? 'Loading intro & Observe…'
        : 'Loading Observe…'
      : item.kind === 'process'
        ? 'Loading Process…'
        : item.kind === 'anticipate'
          ? 'Loading Anticipate…'
          : `Loading ${item.title}…`

  try {
    const result = await preloadLessonAssets({
      introMediaId: includeIntro
        ? (lesson.value.introMedia?.media_asset_id ?? null)
        : null,
      items: [item],
      label,
      onProgress: (progress) => {
        if (generation !== preloadGeneration) return
        preloadProgress.value = progress
      },
    })
    if (generation !== preloadGeneration) {
      releaseLessonPreloadRetain(result.retain)
      return
    }
    preloadRetain = result.retain
    for (const [id, definition] of result.sections) {
      sectionCache.value.set(id, definition)
    }

    if (index === 0) {
      const showingIntro = await playIntroIfNeeded()
      if (generation !== preloadGeneration) return
      if (showingIntro) return
    }
    showPlaying(index)
  } catch (cause) {
    if (generation !== preloadGeneration) return
    error.value = cause instanceof Error ? cause.message : 'Failed to load lesson section'
    phase.value = 'error'
  }
}

function onIntroEnded(): void {
  if (lesson.value.introShowOnFirstVisitOnly !== false) {
    markLessonIntroSeen(props.definition.id)
  }
  introSrc.value = null
  showPlaying(0)
}

async function startLesson(): Promise<void> {
  preloadGeneration += 1
  clearPreloadRetain()
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

  await preloadAndEnter(0)
}

function advanceToNextSection(): void {
  void preloadAndEnter(sectionIndex.value + 1)
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
  branchCorrect?: boolean
  questionResults?: Array<{ id: string; label: string; correct: boolean }>
}): void {
  sectionResults.value = {
    ...sectionResults.value,
    anticipate: {
      kind: 'anticipate',
      percent: payload?.percent ?? 0,
      correctCount: payload?.correctCount ?? 0,
      totalCount: payload?.totalCount ?? 0,
      branchCorrect: payload?.branchCorrect,
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
      <div class="lesson-preloader-lottie" aria-hidden="true">
        <ProcessResultsLottie :animation-data="preloadAnimation" loop />
      </div>
    </div>
    <p v-else-if="phase === 'error'" class="process-player-message">{{ error }}</p>
    <ProcessVideoStage
      v-else-if="phase === 'intro' && introSrc"
      :src="introSrc"
      instruction-text=""
      @ended="onIntroEnded"
    />
    <template v-else-if="phase === 'playing' && sectionDefinition && currentItem">
      <SeeExperience
        v-if="currentItem.kind === 'see'"
        :key="sectionDefinition.id"
        :definition="sectionDefinition"
        @finished="onSeeFinished"
      />
      <ProcessExperience
        v-else-if="currentItem.kind === 'process'"
        :key="sectionDefinition.id"
        :definition="sectionDefinition"
        @finished="onProcessFinished"
      />
      <AnticipateExperience
        v-else-if="currentItem.kind === 'anticipate'"
        :key="sectionDefinition.id"
        :definition="sectionDefinition"
        @finished="onAnticipateFinished"
      />
    </template>
    <LessonResultsCard
      v-else-if="phase === 'results'"
      :title="resultsModel.title"
      :percent="resultsModel.percent"
      :passed="resultsModel.passed"
      :summary="resultsModel.summary"
      :sections="resultsModel.sections"
      @continue="emit('finished')"
    />
  </div>
</template>
