<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { readProcessDefinition } from '@/activities/processDefinition'
import ProcessResultsCard from '@/components/process/ProcessResultsCard.vue'
import ProcessResultsFailCard from '@/components/process/ProcessResultsFailCard.vue'
import ProcessSeverityPopover from '@/components/process/ProcessSeverityPopover.vue'
import ProcessTheoryPopover from '@/components/process/ProcessTheoryPopover.vue'
import ProcessVideoStage from '@/components/process/ProcessVideoStage.vue'
import { services } from '@/app/container'
import type { ActivityDefinition } from '@/types/activity'
import {
  configuredSurveyQuestions,
  emptyQuestionBank,
  processQuestionResults,
  scoreProcessQuestions,
} from '@/types/questions'

const props = defineProps<{
  definition: ActivityDefinition
}>()

const emit = defineEmits<{
  finished: []
}>()

type Phase = 'playing' | 'questions' | 'results'

const src = ref<string | null>(null)
const error = ref<string | null>(null)
const phase = ref<Phase>('playing')
const questionIndex = ref(0)
const answers = ref<Record<string, number>>({})
const stage = ref<{ holdLastFrame?: () => void } | null>(null)

const process = computed(() => readProcessDefinition(props.definition))
const instructionText = computed(() => process.value.instructionText)
const passThreshold = computed(() => process.value.secondSegmentScoreThreshold ?? 70)
const questions = computed(() =>
  configuredSurveyQuestions(process.value.segments[0]?.questions ?? emptyQuestionBank()),
)
const currentQuestion = computed(() => questions.value[questionIndex.value] ?? null)
const score = computed(() =>
  scoreProcessQuestions({ version: 2, questions: questions.value }, answers.value),
)
const results = computed(() =>
  processQuestionResults({ version: 2, questions: questions.value }, answers.value),
)
const passed = computed(() => score.value.max <= 0 || score.value.percent >= passThreshold.value)

watch(
  () => process.value.segments[0]?.media?.media_asset_id,
  async (mediaId) => {
    src.value = null
    error.value = null
    phase.value = 'playing'
    questionIndex.value = 0
    answers.value = {}
    if (!mediaId) {
      error.value = 'This process has no Video 1 yet.'
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

function storeAnswer(questionId: string, answerIndex: number): void {
  answers.value = { ...answers.value, [questionId]: answerIndex }
}

function showResults(): void {
  stage.value?.holdLastFrame?.()
  phase.value = 'results'
}

function onVideoEnded(): void {
  if (phase.value !== 'playing') return
  stage.value?.holdLastFrame?.()
  if (questions.value.length === 0) {
    showResults()
    return
  }
  questionIndex.value = 0
  phase.value = 'questions'
}

function onQuestionComplete(): void {
  const next = questionIndex.value + 1
  if (next >= questions.value.length) {
    showResults()
    return
  }
  questionIndex.value = next
}
</script>

<template>
  <div class="process-experience" :class="{ 'is-results': phase === 'results' }">
    <p v-if="error" class="process-player-message">{{ error }}</p>
    <template v-else-if="src">
      <ProcessVideoStage
        v-if="phase !== 'results'"
        ref="stage"
        :src="src"
        :instruction-text="instructionText"
        :hold-end="phase !== 'playing'"
        @ended="onVideoEnded"
      />
      <div v-if="phase === 'questions' && currentQuestion" class="process-dim-overlay">
        <ProcessSeverityPopover
          v-if="currentQuestion.kind === 'severity'"
          :key="currentQuestion.id"
          :question="currentQuestion"
          @answer="storeAnswer(currentQuestion.id, $event)"
          @complete="onQuestionComplete"
        />
        <ProcessTheoryPopover
          v-else
          :key="currentQuestion.id"
          :question="currentQuestion"
          @answer="storeAnswer(currentQuestion.id, $event)"
          @complete="onQuestionComplete"
        />
      </div>
      <ProcessResultsCard
        v-if="phase === 'results' && passed"
        :results="results"
        @continue="emit('finished')"
      />
      <ProcessResultsFailCard
        v-else-if="phase === 'results'"
        :results="results"
        @continue="emit('finished')"
      />
    </template>
    <p v-else class="process-player-message">Loading video…</p>
  </div>
</template>
