<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { readAnticipateDefinition } from '@/activities/anticipateDefinition'
import LessonSegmentPreloader from '@/components/lesson/LessonSegmentPreloader.vue'
import ProcessSeverityPopover from '@/components/process/ProcessSeverityPopover.vue'
import ProcessTheoryPopover from '@/components/process/ProcessTheoryPopover.vue'
import ProcessVideoStage from '@/components/process/ProcessVideoStage.vue'
import { services } from '@/app/container'
import type { ActivityDefinition } from '@/types/activity'
import type { AnticipateSegmentIndex } from '@/types/anticipate'
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
  ready: []
  finished: [
    payload?: {
      percent: number
      correctCount: number
      totalCount: number
      questionResults?: Array<{ id: string; label: string; correct: boolean }>
    },
  ]
}>()

type Phase = 'playing' | 'questions'

const segmentIndex = ref<AnticipateSegmentIndex>(0)
const src = ref<string | null>(null)
const error = ref<string | null>(null)
const phase = ref<Phase>('playing')
const questionIndex = ref(0)
const answers = ref<Record<string, number>>({})
const awaitingSegmentVideo = ref(false)

const anticipate = computed(() => readAnticipateDefinition(props.definition))
const passThreshold = computed(() => anticipate.value.secondSegmentScoreThreshold ?? 100)

const video1Questions = computed(() =>
  configuredSurveyQuestions(anticipate.value.segments[0]?.questions ?? emptyQuestionBank()),
)
const activeQuestions = computed(() =>
  configuredSurveyQuestions(
    anticipate.value.segments[segmentIndex.value]?.questions ?? emptyQuestionBank(),
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
  Boolean(anticipate.value.segments[1]?.media?.media_asset_id),
)
const hasVideo3 = computed(() =>
  Boolean(anticipate.value.segments[2]?.media?.media_asset_id),
)

const instructionText = computed(() => {
  if (segmentIndex.value === 0) return anticipate.value.instructionText
  if (segmentIndex.value === 1) return anticipate.value.secondInstructionText
  return ''
})

const instructionPill = computed(() => {
  if (segmentIndex.value === 0) return anticipate.value.instructionPill
  if (segmentIndex.value === 1) return anticipate.value.secondInstructionPill
  return ''
})

const activeMediaId = computed(
  () => anticipate.value.segments[segmentIndex.value]?.media?.media_asset_id ?? null,
)

function resetSession(): void {
  segmentIndex.value = 0
  phase.value = 'playing'
  questionIndex.value = 0
  answers.value = {}
}

watch(
  () => anticipate.value.segments[0]?.media?.media_asset_id,
  () => {
    resetSession()
  },
)

async function loadSrcForMediaId(
  mediaId: string | null,
  segment: AnticipateSegmentIndex,
): Promise<string | null> {
  error.value = null
  if (!mediaId) {
    src.value = null
    if (segment === 0) {
      error.value = 'This anticipate has no Video 1 yet.'
    } else if (segment === 1) {
      error.value = 'Video 2 is not configured for this anticipate.'
    } else {
      error.value = 'Video 3 is not configured for this anticipate.'
    }
    return null
  }
  try {
    return await services.media.getSignedUrl(mediaId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load video'
    return null
  }
}

watch(
  activeMediaId,
  (mediaId) => {
    void (async () => {
      const nextSrc = await loadSrcForMediaId(mediaId, segmentIndex.value)
      if (nextSrc == null) return
      if (activeMediaId.value === mediaId) {
        src.value = nextSrc
      }
    })()
  },
  { immediate: true },
)

async function startSegment(index: AnticipateSegmentIndex): Promise<void> {
  if (index > 0) awaitingSegmentVideo.value = true
  const mediaId = anticipate.value.segments[index]?.media?.media_asset_id ?? null
  const nextSrc = await loadSrcForMediaId(mediaId, index)
  if (nextSrc == null) {
    awaitingSegmentVideo.value = false
    return
  }
  segmentIndex.value = index
  questionIndex.value = 0
  phase.value = 'playing'
  src.value = nextSrc
}

function onStageReady(): void {
  awaitingSegmentVideo.value = false
  emit('ready')
}

function storeAnswer(questionId: string, answerIndex: number): void {
  answers.value = { ...answers.value, [questionId]: answerIndex }
}

function emitFinished(): void {
  emit('finished', {
    percent: score.value.percent,
    correctCount: results.value.filter((item) => item.correct).length,
    totalCount: results.value.length,
    questionResults: results.value.map((item) => ({
      id: item.id,
      label: item.label,
      correct: item.correct,
    })),
  })
}

function completeActiveSegment(): void {
  if (segmentIndex.value === 0) {
    void afterVideo1Questions()
    return
  }
  if (segmentIndex.value === 1) {
    if (hasVideo3.value) {
      void startSegment(2)
      return
    }
    emitFinished()
    return
  }
  emitFinished()
}

function onVideoEnded(): void {
  if (phase.value !== 'playing') return
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

async function afterVideo1Questions(): Promise<void> {
  if (passed.value) {
    if (hasVideo3.value) {
      await startSegment(2)
      return
    }
    emitFinished()
    return
  }
  if (hasVideo2.value) {
    await startSegment(1)
    return
  }
  emitFinished()
}
</script>

<template>
  <div class="process-experience">
    <LessonSegmentPreloader v-if="awaitingSegmentVideo" />
    <p v-if="error" class="process-player-message">{{ error }}</p>
    <template v-else-if="src">
      <ProcessVideoStage
        :src="src"
        :instruction-text="instructionText"
        :instruction-pill="instructionPill"
        :hold-end="phase !== 'playing'"
        @ready="onStageReady"
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
    </template>
    <p v-else class="process-player-message">Loading video…</p>
  </div>
</template>
