<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import questionPassIcon from '@/assets/lesson/question-pass.svg'
import metricFailIcon from '@/assets/lesson/metric-fail.svg'
import {
  configuredAnswerEntries,
  isAnswerCorrect,
  type ProcessSurveyQuestion,
} from '@/types/questions'

const props = defineProps<{
  question: ProcessSurveyQuestion
}>()

const emit = defineEmits<{
  answer: [answerIndex: number]
  complete: []
}>()

const REVEAL_DELAY_MS = 1000

const selectedIndex = ref<number | null>(null)
const locked = ref(false)
const revealExplanation = ref(false)
const revealEl = ref<HTMLElement | null>(null)
let advanceTimer = 0
let revealTimer = 0

const answers = computed(() => configuredAnswerEntries(props.question))
const showExplanation = computed(() => props.question.showExplanation !== false)
const showCorrectIncorrect = computed(() => props.question.showCorrectIncorrect !== false)
const explanationText = computed(() => props.question.explanation.trim())
const answeredCorrectly = computed(
  () => selectedIndex.value != null && isAnswerCorrect(props.question, selectedIndex.value),
)
const feedback = computed(() => {
  if (!showCorrectIncorrect.value || !locked.value || selectedIndex.value == null) {
    return null
  }
  return answeredCorrectly.value ? 'correct' : 'incorrect'
})
const needsExplanation = computed(
  () => locked.value && showExplanation.value && !answeredCorrectly.value,
)
/** Explanation + Continue only after an incorrect answer, after a short pause. */
const awaitingContinue = computed(() => needsExplanation.value && revealExplanation.value)

watch(
  () => props.question.id,
  () => {
    selectedIndex.value = null
    locked.value = false
    revealExplanation.value = false
    window.clearTimeout(advanceTimer)
    window.clearTimeout(revealTimer)
  },
)

watch(awaitingContinue, async (open) => {
  if (!open) return
  await nextTick()
  revealEl.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
})

function answerState(index: number): 'default' | 'correct' | 'incorrect' {
  if (!locked.value || !showCorrectIncorrect.value) return 'default'
  if (needsExplanation.value) {
    if (awaitingContinue.value && index === props.question.correctIndex) return 'correct'
    if (selectedIndex.value === index && index !== props.question.correctIndex) {
      return 'incorrect'
    }
    return 'default'
  }
  if (selectedIndex.value === index) {
    return index === props.question.correctIndex ? 'correct' : 'incorrect'
  }
  return 'default'
}

function select(index: number): void {
  if (locked.value) return
  selectedIndex.value = index
  locked.value = true
  emit('answer', index)
  if (showExplanation.value && !isAnswerCorrect(props.question, index)) {
    revealTimer = window.setTimeout(() => {
      revealExplanation.value = true
    }, REVEAL_DELAY_MS)
    return
  }
  if (!showCorrectIncorrect.value) {
    emit('complete')
    return
  }
  advanceTimer = window.setTimeout(() => emit('complete'), 1600)
}

function continueToNext(): void {
  emit('complete')
}

onBeforeUnmount(() => {
  window.clearTimeout(advanceTimer)
  window.clearTimeout(revealTimer)
})
</script>

<template>
  <div
    class="process-question-card is-theory"
    :class="{ 'is-explained': awaitingContinue }"
    role="dialog"
    aria-label="Theory question"
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
    <div class="process-theory-answers">
      <button
        v-for="answer in answers"
        :key="answer.index"
        type="button"
        class="process-theory-answer"
        :class="answerState(answer.index)"
        :disabled="locked"
        @click="select(answer.index)"
      >
        {{ answer.text }}
      </button>
    </div>
    <div
      ref="revealEl"
      class="process-question-reveal"
      :class="{ 'is-open': awaitingContinue }"
      :aria-hidden="!awaitingContinue"
    >
      <div class="process-question-reveal-inner">
        <p v-if="explanationText" class="process-question-feedback">
          {{ explanationText }}
        </p>
        <button
          type="button"
          class="process-question-continue"
          :tabindex="awaitingContinue ? 0 : -1"
          :disabled="!awaitingContinue"
          @click="continueToNext"
        >
          Continue
        </button>
      </div>
    </div>
  </div>
</template>
