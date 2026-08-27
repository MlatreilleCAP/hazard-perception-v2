<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readLessonDefinition } from '@/activities/lessonDefinition'
import { services } from '@/app/container'
import { cloneJson } from '@/app/clone'
import AnticipateExperience from '@/components/anticipate/AnticipateExperience.vue'
import LessonResultsCard from '@/components/lesson/LessonResultsCard.vue'
import ProcessExperience from '@/components/process/ProcessExperience.vue'
import ProcessVideoStage from '@/components/process/ProcessVideoStage.vue'
import SeeExperience from '@/components/see/SeeExperience.vue'
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

const sectionResults = ref<
  Partial<Record<'see' | 'process' | 'anticipate', LessonSectionResult>>
>({})

let loadGeneration = 0

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

async function enterSection(index: number): Promise<void> {
  const item = orderedItems.value[index]
  if (!item) {
    phase.value = 'results'
    sectionDefinition.value = null
    return
  }

  const generation = loadGeneration
  sectionDefinition.value = null
  introSrc.value = null
  error.value = null

  try {
    const definition = await loadSectionDefinition(item)
    if (generation !== loadGeneration) return
    sectionDefinition.value = definition
    sectionIndex.value = index
    phase.value = 'playing'
  } catch (cause) {
    if (generation !== loadGeneration) return
    error.value = cause instanceof Error ? cause.message : 'Failed to load lesson section'
    phase.value = 'error'
  }
}

function onIntroEnded(): void {
  if (lesson.value.introShowOnFirstVisitOnly !== false) {
    markLessonIntroSeen(props.definition.id)
  }
  introSrc.value = null
  void enterSection(0)
}

async function startLesson(): Promise<void> {
  loadGeneration += 1
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
  loadGeneration += 1
})
</script>

<template>
  <div
    class="lesson-experience"
    :class="{ 'is-results': phase === 'results' }"
  >
    <p v-if="phase === 'error'" class="process-player-message">{{ error }}</p>
    <ProcessVideoStage
      v-else-if="phase === 'intro' && introSrc"
      class="lesson-intro-cover"
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
