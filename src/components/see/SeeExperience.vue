<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { readSeeDefinition } from '@/activities/seeDefinition'
import { services } from '@/app/container'
import ProcessInstructionCard from '@/components/process/ProcessInstructionCard.vue'
import ProcessResultsQuestionList from '@/components/process/ProcessResultsQuestionList.vue'
import ProcessSeverityPopover from '@/components/process/ProcessSeverityPopover.vue'
import ProcessTheoryPopover from '@/components/process/ProcessTheoryPopover.vue'
import { clientToPercent } from '@/lib/hazards/coordinates'
import { getHazardStateAtTime } from '@/lib/hazards/interpolate'
import type { ActivityDefinition } from '@/types/activity'
import {
  configuredSurveyQuestions,
  processQuestionResults,
  type ProcessQuestionResult,
  type ProcessSurveyQuestion,
} from '@/types/questions'
import type { SeeHazard } from '@/types/see'

const props = defineProps<{
  definition: ActivityDefinition
}>()

const emit = defineEmits<{
  finished: []
}>()

type Phase = 'ready' | 'playing' | 'questions' | 'results'

const src = ref<string | null>(null)
const error = ref<string | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const phase = ref<Phase>('ready')
const currentTime = ref(0)
const hitIds = ref<Set<string>>(new Set())
const answers = ref<Record<string, number>>({})
const questionIndex = ref(0)
const tapFlash = ref<{ x: number; y: number; hit: boolean } | null>(null)
let playFrame = 0
let flashTimer = 0

const see = computed(() => readSeeDefinition(props.definition))
const questions = computed(() =>
  see.value.hazards.flatMap((hazard) =>
    configuredSurveyQuestions(hazard.questions).map((question) => ({
      hazard,
      question,
    })),
  ),
)
const currentQuestion = computed(() => questions.value[questionIndex.value] ?? null)
const questionResults = computed((): ProcessQuestionResult[] => {
  const bank = {
    version: 2 as const,
    questions: questions.value.map((item) => item.question),
  }
  return processQuestionResults(bank, answers.value)
})

watch(
  () => see.value.media?.media_asset_id,
  async (mediaId) => {
    src.value = null
    error.value = null
    phase.value = 'ready'
    hitIds.value = new Set()
    answers.value = {}
    questionIndex.value = 0
    currentTime.value = 0
    if (!mediaId) {
      error.value = 'This scenario has no video yet.'
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

function syncTime(): void {
  currentTime.value = video.value?.currentTime ?? 0
}

function startPlayhead(): void {
  cancelAnimationFrame(playFrame)
  const tick = () => {
    syncTime()
    playFrame = requestAnimationFrame(tick)
  }
  playFrame = requestAnimationFrame(tick)
}

function begin(): void {
  phase.value = 'playing'
  void video.value?.play().catch(() => undefined)
  startPlayhead()
}

function isHit(hazard: SeeHazard, x: number, y: number): boolean {
  const state = getHazardStateAtTime(hazard, currentTime.value)
  if (!state) return false
  return Math.hypot(x - state.x, y - state.y) <= state.radius
}

function onTap(event: MouseEvent): void {
  if (phase.value !== 'playing' || !video.value) return
  const { x, y } = clientToPercent(event.clientX, event.clientY, video.value)
  const hit = see.value.hazards.find(
    (hazard) => !hitIds.value.has(hazard.id) && isHit(hazard, x, y),
  )
  tapFlash.value = { x, y, hit: Boolean(hit) }
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    tapFlash.value = null
  }, 280)
  if (!hit) return
  const next = new Set(hitIds.value)
  next.add(hit.id)
  hitIds.value = next
}

function finishPlayback(): void {
  if (phase.value !== 'playing') return
  cancelAnimationFrame(playFrame)
  video.value?.pause()
  if (questions.value.length === 0) {
    phase.value = 'results'
    return
  }
  questionIndex.value = 0
  phase.value = 'questions'
}

function storeAnswer(question: ProcessSurveyQuestion, answerIndex: number): void {
  answers.value = { ...answers.value, [question.id]: answerIndex }
}

function onQuestionComplete(): void {
  const next = questionIndex.value + 1
  if (next >= questions.value.length) {
    phase.value = 'results'
    return
  }
  questionIndex.value = next
}

onBeforeUnmount(() => {
  cancelAnimationFrame(playFrame)
  window.clearTimeout(flashTimer)
  video.value?.pause()
})

const spotted = computed(() => hitIds.value.size)
const totalHazards = computed(() => see.value.hazards.length)
const allSpotted = computed(() => totalHazards.value > 0 && spotted.value >= totalHazards.value)
</script>

<template>
  <div class="see-experience" :class="{ 'is-results': phase === 'results' }">
    <p v-if="error" class="process-player-message">{{ error }}</p>
    <template v-else-if="src">
      <div v-if="phase !== 'results'" class="see-stage">
        <video
          ref="video"
          class="see-player-video"
          :src="src"
          playsinline
          preload="auto"
          @ended="finishPlayback"
        />
        <button
          v-if="phase === 'playing'"
          type="button"
          class="see-tap-layer"
          aria-label="Tap hazards as they develop"
          @click="onTap"
        />
        <div
          v-if="tapFlash"
          class="see-tap-flash"
          :class="{ hit: tapFlash.hit, miss: !tapFlash.hit }"
          :style="{ left: `${tapFlash.x}%`, top: `${tapFlash.y}%` }"
        />
        <div v-if="phase === 'ready'" class="process-instruction-overlay">
          <ProcessInstructionCard
            text="Watch the following video and tap hazards as they develop."
            tag="See"
            @begin="begin"
          />
        </div>
        <div v-if="phase === 'questions' && currentQuestion" class="process-dim-overlay">
          <ProcessSeverityPopover
            v-if="currentQuestion.question.kind === 'severity'"
            :question="currentQuestion.question"
            @answer="storeAnswer(currentQuestion.question, $event)"
            @complete="onQuestionComplete"
          />
          <ProcessTheoryPopover
            v-else
            :question="currentQuestion.question"
            @answer="storeAnswer(currentQuestion.question, $event)"
            @complete="onQuestionComplete"
          />
        </div>
      </div>

      <div v-else class="process-results-page" role="main" aria-label="See results">
        <p class="process-results-announcement" :class="{ 'is-emphasis': !allSpotted }">
          {{
            totalHazards === 0
              ? 'NO HAZARDS CONFIGURED'
              : allSpotted
                ? 'ALL HAZARDS SPOTTED'
                : 'KEEP SCANNING'
          }}
        </p>
        <p class="see-results-score">
          {{ spotted }} of {{ totalHazards }} hazard{{ totalHazards === 1 ? '' : 's' }} spotted
        </p>
        <ProcessResultsQuestionList v-if="questionResults.length > 0" :results="questionResults" />
        <button type="button" class="process-instruction-begin" @click="$emit('finished')">
          Continue
        </button>
      </div>
    </template>
    <p v-else class="process-player-message">Loading video…</p>
  </div>
</template>
