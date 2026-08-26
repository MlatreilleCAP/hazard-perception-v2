<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { readLessonDefinition } from '@/activities/lessonDefinition'
import { services } from '@/app/container'
import { cloneJson } from '@/app/clone'
import LessonResultsCard from '@/components/lesson/LessonResultsCard.vue'
import ProcessExperience from '@/components/process/ProcessExperience.vue'
import SeeExperience from '@/components/see/SeeExperience.vue'
import type { ActivityDefinition } from '@/types/activity'
import {
  buildLessonResultsModel,
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

type Phase = 'loading' | 'playing' | 'results' | 'error'

const phase = ref<Phase>('loading')
const error = ref<string | null>(null)
const sectionIndex = ref(0)
const sectionDefinition = ref<ActivityDefinition | null>(null)
const sectionResults = ref<
  Partial<Record<'see' | 'process' | 'anticipate', LessonSectionResult>>
>({})

const lesson = computed(() => readLessonDefinition(props.definition))
const orderedItems = computed(() =>
  orderedInroadsCompositionItems(lesson.value.composition).filter(
    (item) => item.kind === 'see' || item.kind === 'process',
  ),
)
const currentItem = computed(
  (): LessonCompositionItem | null => orderedItems.value[sectionIndex.value] ?? null,
)
const resultsModel = computed(() =>
  buildLessonResultsModel(props.definition.metadata.title, sectionResults.value),
)

async function loadSection(index: number): Promise<void> {
  const item = orderedItems.value[index]
  if (!item) {
    phase.value = 'results'
    sectionDefinition.value = null
    return
  }
  phase.value = 'loading'
  error.value = null
  sectionDefinition.value = null
  try {
    const loaded = await services.persistence.getById(item.refId)
    if (!loaded) {
      throw new Error(`${item.title} could not be loaded.`)
    }
    sectionDefinition.value = cloneJson(loaded)
    sectionIndex.value = index
    phase.value = 'playing'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load lesson section'
    phase.value = 'error'
  }
}

async function startLesson(): Promise<void> {
  sectionResults.value = {}
  sectionIndex.value = 0
  if (orderedItems.value.length === 0) {
    error.value = 'This lesson has no See or Process sections yet.'
    phase.value = 'error'
    return
  }
  await loadSection(0)
}

function onSeeFinished(payload?: { spotted: number; total: number }): void {
  sectionResults.value = {
    ...sectionResults.value,
    see: {
      kind: 'see',
      spotted: payload?.spotted ?? 0,
      total: payload?.total ?? 0,
    },
  }
  void loadSection(sectionIndex.value + 1)
}

function onProcessFinished(payload?: {
  percent: number
  correctCount: number
  totalCount: number
}): void {
  sectionResults.value = {
    ...sectionResults.value,
    process: {
      kind: 'process',
      percent: payload?.percent ?? 0,
      correctCount: payload?.correctCount ?? 0,
      totalCount: payload?.totalCount ?? 0,
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
</script>

<template>
  <div class="lesson-experience" :class="{ 'is-results': phase === 'results' }">
    <p v-if="phase === 'loading'" class="process-player-message">Loading lesson…</p>
    <p v-else-if="phase === 'error'" class="process-player-message">{{ error }}</p>
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
    </template>
    <LessonResultsCard
      v-else-if="phase === 'results'"
      :title="resultsModel.title"
      :percent="resultsModel.percent"
      :sections="resultsModel.sections"
      @continue="emit('finished')"
    />
  </div>
</template>
