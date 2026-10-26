<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLessonButtonLabel, useLessonSubmitLabel } from '@/lib/lesson/buttonLabel'
import questionPassIcon from '@/assets/lesson/question-pass.svg'
import metricFailIcon from '@/assets/lesson/metric-fail.svg'
import sliderFaceIcon from '@/assets/severity-slider-face.svg'
import { HAZARD_SEVERITIES, type HazardSeverity } from '@/types/hazard'
import {
  configuredAnswerEntries,
  explanationForOutcome,
  isAnswerCorrect,
  type ProcessSurveyQuestion,
} from '@/types/questions'

const props = defineProps<{
  question: ProcessSurveyQuestion
  /** Left/right move the slider; Enter submits, then continues. */
  keyboardNav?: boolean
}>()

const emit = defineEmits<{
  answer: [answerIndex: number]
  complete: []
}>()

const lessonButtonLabel = useLessonButtonLabel()
const lessonSubmitLabel = useLessonSubmitLabel()

const THUMB_SIZE = 32
const SEVERITY_POSITION: Record<HazardSeverity, number> = {
  low: 0,
  medium: 50,
  high: 100,
}

const answers = computed(() => configuredAnswerEntries(props.question).slice(0, 3))
const REVEAL_DELAY_MS = 1000

const draftIndex = ref(1)
const submitted = ref(false)
const revealExplanation = ref(false)
const dragging = ref(false)
const trackEl = ref<HTMLElement | null>(null)
const continueBtnEl = ref<HTMLButtonElement | null>(null)
let revealTimer = 0

const optionLabels = computed(() => {
  const defaults = ['Low', 'Medium', 'High'] as const
  return HAZARD_SEVERITIES.map((level, index) => ({
    level,
    index,
    label: answers.value[index]?.text.trim() || defaults[index],
  }))
})

const severity = computed(
  (): HazardSeverity => HAZARD_SEVERITIES[draftIndex.value] ?? 'medium',
)
const position = computed(() => SEVERITY_POSITION[severity.value])
const isCorrect = computed(
  () => submitted.value && isAnswerCorrect(props.question, draftIndex.value),
)
const explanationText = computed(() =>
  explanationForOutcome(props.question, isCorrect.value),
)
const awaitingContinue = computed(
  () => submitted.value && revealExplanation.value,
)
const revealAnswerFeedback = computed(() => submitted.value)
const feedback = computed(() => {
  if (!revealAnswerFeedback.value) return null
  return isCorrect.value ? 'correct' : 'incorrect'
})
const fillWidth = computed(
  () =>
    `calc((100% - ${THUMB_SIZE}px) * ${position.value / 100} + ${THUMB_SIZE / 2}px)`,
)
const thumbLeft = computed(
  () => `calc((100% - ${THUMB_SIZE}px) * ${position.value / 100})`,
)

watch(
  () => props.question.id,
  () => {
    submitted.value = false
    revealExplanation.value = false
    draftIndex.value = Math.min(1, Math.max(0, answers.value.length - 1))
    window.clearTimeout(revealTimer)
    focusSlider()
  },
)

function isPreviewChromeTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], .question-review-tools, .question-review-resize',
      ),
    )
  )
}

function focusSlider(): void {
  if (!props.keyboardNav || submitted.value) return
  void nextTick(() => trackEl.value?.focus({ preventScroll: true }))
}

function severityIndexFromTarget(target: EventTarget | null): number | null {
  if (!(target instanceof HTMLElement)) return null
  const label = target.closest<HTMLElement>('[data-severity-index]')
  if (!label) return null
  const parsed = Number(label.dataset.severityIndex)
  if (!Number.isInteger(parsed)) return null
  if (parsed < 0 || parsed >= answers.value.length) return null
  return parsed
}

function moveDraft(delta: number): void {
  if (submitted.value) return
  const last = Math.max(0, answers.value.length - 1)
  draftIndex.value = Math.min(last, Math.max(0, draftIndex.value + delta))
  focusSlider()
}

function onPreviewKeydown(event: KeyboardEvent): void {
  if (!props.keyboardNav) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (isPreviewChromeTarget(event.target)) return

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    event.stopPropagation()
    moveDraft(event.key === 'ArrowRight' ? 1 : -1)
    return
  }

  if (event.key !== 'Enter') return
  event.preventDefault()
  event.stopPropagation()
  if (event.repeat) return
  if (awaitingContinue.value) {
    continueToNext()
    return
  }
  if (submitted.value) return
  const focused = severityIndexFromTarget(event.target)
  if (focused != null) draftIndex.value = focused
  submit()
}

function snapIndexFromRatio(ratio: number): number {
  if (ratio < 0.33) return 0
  if (ratio < 0.67) return 1
  return Math.min(2, answers.value.length - 1)
}

function updateFromClientX(clientX: number): void {
  if (submitted.value) return
  const rect = trackEl.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  draftIndex.value = snapIndexFromRatio(ratio)
}

function onTrackPointerDown(event: PointerEvent): void {
  if (submitted.value || event.button !== 0) return
  updateFromClientX(event.clientX)
}

function onThumbPointerDown(event: PointerEvent): void {
  if (submitted.value || event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onWindowPointerMove(event: PointerEvent): void {
  if (!dragging.value) return
  updateFromClientX(event.clientX)
}

function onWindowPointerUp(): void {
  dragging.value = false
}

function onTrackKeyDown(event: KeyboardEvent): void {
  if (props.keyboardNav || event.defaultPrevented || submitted.value) return
  if (event.key === 'ArrowLeft' && draftIndex.value > 0) {
    draftIndex.value -= 1
    event.preventDefault()
  }
  if (event.key === 'ArrowRight' && draftIndex.value < answers.value.length - 1) {
    draftIndex.value += 1
    event.preventDefault()
  }
}

function selectLevel(index: number): void {
  if (submitted.value) return
  draftIndex.value = index
}

function submit(): void {
  if (submitted.value) return
  submitted.value = true
  emit('answer', draftIndex.value)
  revealTimer = window.setTimeout(() => {
    revealExplanation.value = true
  }, REVEAL_DELAY_MS)
}

function continueToNext(): void {
  emit('complete')
}

watch(revealExplanation, (visible) => {
  if (!props.keyboardNav || !visible) return
  continueBtnEl.value?.focus({ preventScroll: true })
}, { flush: 'post' })

onMounted(() => {
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
  if (!props.keyboardNav) return
  window.addEventListener('keydown', onPreviewKeydown, true)
  focusSlider()
})

onBeforeUnmount(() => {
  window.clearTimeout(revealTimer)
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', onWindowPointerUp)
  window.removeEventListener('keydown', onPreviewKeydown, true)
})
</script>

<template>
  <div
    class="process-question-card"
    :class="{ 'is-explained': awaitingContinue }"
    role="dialog"
    aria-label="Severity question"
  >
    <img
      v-if="feedback"
      class="process-question-result-icon"
      :class="feedback"
      :src="feedback === 'correct' ? questionPassIcon : metricFailIcon"
      :alt="feedback === 'correct' ? 'Correct' : 'Incorrect'"
      width="31"
      height="31"
    />
    <p class="process-question-prompt">{{ question.questionText }}</p>

    <div class="process-severity-slider">
      <div
        ref="trackEl"
        class="process-severity-track"
        :class="{ 'is-disabled': submitted }"
        role="slider"
        :aria-valuemin="0"
        :aria-valuemax="Math.max(0, answers.length - 1)"
        :aria-valuenow="draftIndex"
        :aria-valuetext="optionLabels[draftIndex]?.label ?? ''"
        aria-label="Hazard severity"
        :tabindex="submitted ? -1 : 0"
        @pointerdown="onTrackPointerDown"
        @keydown="onTrackKeyDown"
      >
        <div class="process-severity-track-rail" aria-hidden="true" />
        <div
          class="process-severity-track-fill"
          :class="{ 'is-dragging': dragging }"
          aria-hidden="true"
          :style="{ width: fillWidth }"
        />
        <div
          class="process-severity-thumb"
          :class="{ 'is-dragging': dragging, 'is-disabled': submitted }"
          :style="{ left: thumbLeft }"
          @pointerdown="onThumbPointerDown"
        >
          <img
            class="process-severity-thumb-face"
            :src="sliderFaceIcon"
            alt=""
            width="32"
            height="32"
            draggable="false"
          />
        </div>
      </div>

      <div class="process-severity-labels">
        <button
          v-for="option in optionLabels"
          :key="option.level"
          type="button"
          class="process-severity-label"
          :data-severity-index="option.index"
          :class="{
            'is-start': option.index === 0,
            'is-end': option.index === optionLabels.length - 1,
            'is-active': draftIndex === option.index && !revealAnswerFeedback,
            'is-correct':
              revealAnswerFeedback && option.index === question.correctIndex,
            'is-incorrect':
              revealAnswerFeedback &&
              !isCorrect &&
              draftIndex === option.index,
          }"
          :disabled="submitted"
          @click="selectLevel(option.index)"
        >
          <template
            v-for="(word, wordIndex) in option.label.trim().split(/\s+/)"
            :key="`${option.level}-${wordIndex}`"
          >
            <br v-if="wordIndex > 0" />{{ word }}
          </template>
        </button>
      </div>
    </div>

    <div
      class="process-question-submit-slot"
      :class="{ 'is-hidden': awaitingContinue }"
    >
      <div class="process-question-submit-inner">
        <button
          type="button"
          class="process-instruction-begin"
          :disabled="submitted"
          :tabindex="awaitingContinue ? -1 : 0"
          @click="submit"
        >
          {{ lessonSubmitLabel }}
        </button>
      </div>
    </div>

    <div
      class="process-question-reveal"
      :class="{ 'is-open': awaitingContinue }"
      :aria-hidden="!awaitingContinue"
    >
      <div class="process-question-reveal-inner">
        <p v-if="explanationText" class="process-question-feedback">
          {{ explanationText }}
        </p>
        <button
          ref="continueBtnEl"
          type="button"
          class="process-question-continue"
          :tabindex="awaitingContinue ? 0 : -1"
          :disabled="!awaitingContinue"
          @click="continueToNext"
        >
          {{ lessonButtonLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
