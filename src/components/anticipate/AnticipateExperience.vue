<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { readAnticipateDefinition } from '@/activities/anticipateDefinition'
import ProcessResultsCard from '@/components/process/ProcessResultsCard.vue'
import ProcessResultsFailCard from '@/components/process/ProcessResultsFailCard.vue'
import ProcessSeverityPopover from '@/components/process/ProcessSeverityPopover.vue'
import ProcessTheoryPopover from '@/components/process/ProcessTheoryPopover.vue'
import ProcessVideoStage from '@/components/process/ProcessVideoStage.vue'
import { services } from '@/app/container'
import type { ActivityDefinition } from '@/types/activity'
import { resolveBranchMedia } from '@/types/anticipate'
import {
  configuredSurveyQuestions,
  isAnswerCorrect,
  processQuestionResults,
  scoreProcessQuestions,
  type ProcessQuestionBank,
} from '@/types/questions'

const props = defineProps<{
  definition: ActivityDefinition
}>()

const emit = defineEmits<{
  finished: [
    payload?: {
      percent: number
      correctCount: number
      totalCount: number
      branchCorrect?: boolean
      questionResults?: Array<{ id: string; label: string; correct: boolean }>
    },
  ]
}>()

type Phase =
  | 'instruction'
  | 'playing'
  | 'branch_question'
  | 'branch_playing'
  | 'questions'
  | 'remedial_playing'
  | 'remedial_questions'
  | 'results'

const phase = ref<Phase>('instruction')
const src = ref<string | null>(null)
const error = ref<string | null>(null)
const selectedBranchIndex = ref<number | null>(null)
const branchCorrect = ref(false)
const questionIndex = ref(0)
const remedialQuestionIndex = ref(0)
const answers = ref<Record<string, number>>({})
const remedialPlayed = ref(false)
const stage = ref<{ holdLastFrame?: () => void } | null>(null)

const anticipate = computed(() => readAnticipateDefinition(props.definition))

const postQuestions = computed(() =>
  configuredSurveyQuestions(anticipate.value.questions),
)
const remedialQuestions = computed(() =>
  configuredSurveyQuestions(anticipate.value.remedialQuestions),
)
const currentQuestion = computed(() => {
  if (phase.value === 'remedial_questions') {
    return remedialQuestions.value[remedialQuestionIndex.value] ?? null
  }
  return postQuestions.value[questionIndex.value] ?? null
})

const scoredBank = computed((): ProcessQuestionBank => anticipate.value.questions)

const score = computed(() => scoreProcessQuestions(scoredBank.value, answers.value))
const results = computed(() => processQuestionResults(scoredBank.value, answers.value))
const passed = computed(() => score.value.max <= 0 || score.value.percent >= 70)

const instructionText = computed(() =>
  phase.value === 'instruction' || phase.value === 'playing'
    ? anticipate.value.instructionText
    : '',
)

const holdEnd = computed(
  () =>
    phase.value === 'branch_question' ||
    phase.value === 'questions' ||
    phase.value === 'remedial_questions',
)

function allPostQuestionsCorrect(): boolean {
  return postQuestions.value.every((question) => {
    const selected = answers.value[question.id]
    return typeof selected === 'number' && isAnswerCorrect(question, selected)
  })
}

function hasRemedialPath(): boolean {
  return Boolean(
    anticipate.value.remedialMedia?.media_asset_id || remedialQuestions.value.length > 0,
  )
}

async function loadMainVideo(): Promise<void> {
  error.value = null
  const mediaId = anticipate.value.media?.media_asset_id
  if (!mediaId) {
    src.value = null
    error.value = 'This anticipate has no main video yet.'
    return
  }
  try {
    src.value = await services.media.getSignedUrl(mediaId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load video'
  }
}

function resetSession(): void {
  phase.value = anticipate.value.instructionText.trim() ? 'instruction' : 'playing'
  selectedBranchIndex.value = null
  branchCorrect.value = false
  questionIndex.value = 0
  remedialQuestionIndex.value = 0
  answers.value = {}
  remedialPlayed.value = false
  void loadMainVideo()
}

watch(
  () => props.definition.id,
  () => {
    resetSession()
  },
  { immediate: true },
)

function onMainEnded(): void {
  if (phase.value !== 'playing' && phase.value !== 'instruction') return
  stage.value?.holdLastFrame?.()
  phase.value = 'branch_question'
}

function onBranchAnswer(index: number): void {
  selectedBranchIndex.value = index
  branchCorrect.value = index === anticipate.value.branchQuestion.correctIndex
}

async function onBranchQuestionComplete(): Promise<void> {
  const index = selectedBranchIndex.value
  if (index == null) return
  const media = resolveBranchMedia(anticipate.value, index)
  if (!media?.media_asset_id) {
    error.value = 'No branch video is configured for that answer.'
    return
  }
  try {
    const nextSrc = await services.media.getSignedUrl(media.media_asset_id)
    phase.value = 'branch_playing'
    src.value = nextSrc
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load branch video'
  }
}

function startPostQuestionsOrResults(): void {
  if (postQuestions.value.length === 0) {
    phase.value = 'results'
    return
  }
  questionIndex.value = 0
  phase.value = 'questions'
}

function startRemedialQuestionsOrResults(): void {
  if (remedialQuestions.value.length === 0) {
    emitFinished()
    return
  }
  remedialPlayed.value = true
  remedialQuestionIndex.value = 0
  phase.value = 'remedial_questions'
}

async function startRemedialPath(): Promise<void> {
  const mediaId = anticipate.value.remedialMedia?.media_asset_id
  if (!mediaId) {
    startRemedialQuestionsOrResults()
    return
  }
  try {
    const nextSrc = await services.media.getSignedUrl(mediaId)
    remedialPlayed.value = true
    phase.value = 'remedial_playing'
    src.value = nextSrc
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load remedial video'
  }
}

function afterPostQuestions(): void {
  phase.value = 'results'
}

async function onResultsContinue(): Promise<void> {
  if (
    !remedialPlayed.value &&
    !allPostQuestionsCorrect() &&
    hasRemedialPath()
  ) {
    await startRemedialPath()
    return
  }
  emitFinished()
}

function onBranchEnded(): void {
  if (phase.value !== 'branch_playing') return
  stage.value?.holdLastFrame?.()
  startPostQuestionsOrResults()
}

function onRemedialEnded(): void {
  if (phase.value !== 'remedial_playing') return
  stage.value?.holdLastFrame?.()
  startRemedialQuestionsOrResults()
}

function onVideoEnded(): void {
  if (phase.value === 'playing') {
    onMainEnded()
    return
  }
  if (phase.value === 'branch_playing') {
    onBranchEnded()
    return
  }
  if (phase.value === 'remedial_playing') {
    onRemedialEnded()
  }
}

function storeAnswer(questionId: string, answerIndex: number): void {
  answers.value = { ...answers.value, [questionId]: answerIndex }
}

function onQuestionComplete(): void {
  if (phase.value === 'remedial_questions') {
    const next = remedialQuestionIndex.value + 1
    if (next >= remedialQuestions.value.length) {
      emitFinished()
      return
    }
    remedialQuestionIndex.value = next
    return
  }

  const next = questionIndex.value + 1
  if (next >= postQuestions.value.length) {
    afterPostQuestions()
    return
  }
  questionIndex.value = next
}

function emitFinished(): void {
  emit('finished', {
    percent: score.value.percent,
    correctCount: results.value.filter((item) => item.correct).length,
    totalCount: results.value.length,
    branchCorrect: branchCorrect.value,
    questionResults: results.value.map((item) => ({
      id: item.id,
      label: item.label,
      correct: item.correct,
    })),
  })
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
        :instruction-pill="anticipate.instructionPill"
        :hold-end="holdEnd"
        @begin="phase = 'playing'"
        @ended="onVideoEnded"
      />
      <div v-if="phase === 'branch_question'" class="process-dim-overlay">
        <ProcessTheoryPopover
          :key="anticipate.branchQuestion.id"
          :question="anticipate.branchQuestion"
          @answer="onBranchAnswer"
          @complete="onBranchQuestionComplete"
        />
      </div>
      <div
        v-if="(phase === 'questions' || phase === 'remedial_questions') && currentQuestion"
        class="process-dim-overlay"
      >
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
