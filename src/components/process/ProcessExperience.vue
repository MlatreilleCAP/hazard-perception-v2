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
import type { ProcessSegmentIndex } from '@/types/process'
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
  finished: [payload?: { percent: number; correctCount: number; totalCount: number }]
}>()

type Phase = 'playing' | 'questions' | 'results'

const segmentIndex = ref<ProcessSegmentIndex>(0)
const src = ref<string | null>(null)
const error = ref<string | null>(null)
const phase = ref<Phase>('playing')
const questionIndex = ref(0)
const answers = ref<Record<string, number>>({})
const stage = ref<{ holdLastFrame?: () => void } | null>(null)

const process = computed(() => readProcessDefinition(props.definition))
const passThreshold = computed(() => process.value.secondSegmentScoreThreshold ?? 70)

const video1Questions = computed(() =>
  configuredSurveyQuestions(process.value.segments[0]?.questions ?? emptyQuestionBank()),
)
const activeQuestions = computed(() =>
  configuredSurveyQuestions(
    process.value.segments[segmentIndex.value]?.questions ?? emptyQuestionBank(),
  ),
)
const currentQuestion = computed(() => activeQuestions.value[questionIndex.value] ?? null)

const score = computed(() =>
  scoreProcessQuestions({ version: 2, questions: video1Questions.value }, answers.value),
)
const results = computed(() =>
  processQuestionResults({ version: 2, questions: video1Questions.value }, answers.value),
)
const passed = computed(() => score.value.max <= 0 || score.value.percent >= passThreshold.value)

const hasVideo2 = computed(() =>
  Boolean(process.value.segments[1]?.media?.media_asset_id),
)
const hasVideo3 = computed(() =>
  Boolean(process.value.segments[2]?.media?.media_asset_id),
)

const instructionText = computed(() => {
  if (segmentIndex.value === 0) return process.value.instructionText
  if (segmentIndex.value === 1) return process.value.secondInstructionText
  return ''
})

const instructionPill = computed(() => {
  if (segmentIndex.value === 0) return process.value.instructionPill
  if (segmentIndex.value === 1) return process.value.secondInstructionPill
  return ''
})

const activeMediaId = computed(
  () => process.value.segments[segmentIndex.value]?.media?.media_asset_id ?? null,
)

function resetSession(): void {
  segmentIndex.value = 0
  phase.value = 'playing'
  questionIndex.value = 0
  answers.value = {}
}

watch(
  () => process.value.segments[0]?.media?.media_asset_id,
  () => {
    resetSession()
  },
)

watch(
  activeMediaId,
  async (mediaId) => {
    src.value = null
    error.value = null
    if (!mediaId) {
      if (segmentIndex.value === 0) {
        error.value = 'This process has no Video 1 yet.'
      } else if (segmentIndex.value === 1) {
        error.value = 'Video 2 is not configured for this process.'
      } else {
        error.value = 'Video 3 is not configured for this process.'
      }
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

function startSegment(index: ProcessSegmentIndex): void {
  segmentIndex.value = index
  phase.value = 'playing'
  questionIndex.value = 0
}

function storeAnswer(questionId: string, answerIndex: number): void {
  answers.value = { ...answers.value, [questionId]: answerIndex }
}

function showResults(): void {
  stage.value?.holdLastFrame?.()
  phase.value = 'results'
}

function emitFinished(): void {
  emit('finished', {
    percent: score.value.percent,
    correctCount: results.value.filter((item) => item.correct).length,
    totalCount: results.value.length,
  })
}

function completeActiveSegment(): void {
  if (segmentIndex.value === 0) {
    showResults()
    return
  }
  if (segmentIndex.value === 1) {
    if (hasVideo3.value) {
      startSegment(2)
      return
    }
    emitFinished()
    return
  }
  emitFinished()
}

function onVideoEnded(): void {
  if (phase.value !== 'playing') return
  stage.value?.holdLastFrame?.()
  if (segmentIndex.value === 2) {
    emitFinished()
    return
  }
  if (activeQuestions.value.length === 0) {
    completeActiveSegment()
    return
  }
  questionIndex.value = 0
  phase.value = 'questions'
}

function onQuestionComplete(): void {
  const next = questionIndex.value + 1
  if (next >= activeQuestions.value.length) {
    completeActiveSegment()
    return
  }
  questionIndex.value = next
}

function onResultsContinue(): void {
  if (passed.value) {
    if (hasVideo3.value) {
      startSegment(2)
      return
    }
    emitFinished()
    return
  }
  if (hasVideo2.value) {
    startSegment(1)
    return
  }
  emitFinished()
}
</script>

<template>
  <div class="process-experience" :class="{ 'is-results': phase === 'results' }">
    <p v-if="error" class="process-player-message">{{ error }}</p>
    <template v-else-if="src">
      <ProcessVideoStage
        v-if="phase !== 'results'"
        :key="segmentIndex"
        ref="stage"
        :src="src"
        :instruction-text="instructionText"
        :instruction-pill="instructionPill"
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
        @continue="onResultsContinue"
      />
      <ProcessResultsFailCard
        v-else-if="phase === 'results'"
        :results="results"
        @continue="onResultsContinue"
      />
    </template>
    <p v-else class="process-player-message">Loading video…</p>
  </div>
</template>
