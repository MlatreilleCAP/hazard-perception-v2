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
  label: 'Loading lesson…',
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

async function loadSection(index: number): Promise<void> {
  const item = orderedItems.value[index]
  if (!item) {
    phase.value = 'results'
    sectionDefinition.value = null
    return
  }
  error.value = null
  const cached = sectionCache.value.get(item.refId)
  if (cached) {
    sectionDefinition.value = cloneJson(cached)
    sectionIndex.value = index
    phase.value = 'playing'
    return
  }
  phase.value = 'preloading'
  preloadProgress.value = {
    loaded: 0,
    total: 1,
    label: `Loading ${item.title}…`,
  }
  try {
    const loaded = await services.persistence.getById(item.refId)
    if (!loaded) {
      throw new Error(`${item.title} could not be loaded.`)
    }
    const next = cloneJson(loaded)
    sectionCache.value.set(item.refId, next)
    sectionDefinition.value = cloneJson(next)
    sectionIndex.value = index
    phase.value = 'playing'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load lesson section'
    phase.value = 'error'
  }
}

async function playIntroIfNeeded(): Promise<boolean> {
  const mediaId = lesson.value.introMedia?.media_asset_id
  if (!mediaId) return false
  if (
    lesson.value.introShowOnFirstVisitOnly !== false &&
    hasSeenLessonIntro(props.definition.id)
  ) {
    return false
  }
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

function onIntroEnded(): void {
  if (lesson.value.introShowOnFirstVisitOnly !== false) {
    markLessonIntroSeen(props.definition.id)
  }
  introSrc.value = null
  void loadSection(0)
}

async function startLesson(): Promise<void> {
  const generation = ++preloadGeneration
  clearPreloadRetain()
  sectionResults.value = {}
  sectionIndex.value = 0
  introSrc.value = null
  sectionDefinition.value = null
  sectionCache.value = new Map()
  phase.value = 'preloading'
  error.value = null
  preloadProgress.value = { loaded: 0, total: 1, label: 'Loading lesson…' }

  if (orderedItems.value.length === 0) {
    error.value = 'This lesson has no Observe, Process, or Anticipate sections yet.'
    phase.value = 'error'
    return
  }

  try {
    const skipIntroWarm =
      lesson.value.introShowOnFirstVisitOnly !== false &&
      hasSeenLessonIntro(props.definition.id)
    const result = await preloadLessonAssets({
      introMediaId: skipIntroWarm
        ? null
        : (lesson.value.introMedia?.media_asset_id ?? null),
      items: orderedItems.value,
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
    sectionCache.value = result.sections
    const showingIntro = await playIntroIfNeeded()
    if (generation !== preloadGeneration) return
    if (showingIntro) return
    await loadSection(0)
  } catch (cause) {
    if (generation !== preloadGeneration) return
    error.value = cause instanceof Error ? cause.message : 'Failed to load lesson'
    phase.value = 'error'
  }
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
  void loadSection(sectionIndex.value + 1)
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
  void loadSection(sectionIndex.value + 1)
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
  void loadSection(sectionIndex.value + 1)
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
