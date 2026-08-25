<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  configuredAnswerEntries,
  isAnswerCorrect,
  pointsForAnswer,
  type ProcessSurveyQuestion,
} from '@/types/questions'

const props = defineProps<{
  question: ProcessSurveyQuestion
}>()

const emit = defineEmits<{
  answer: [answerIndex: number]
  complete: []
}>()

const answers = computed(() => configuredAnswerEntries(props.question).slice(0, 3))
const draftIndex = ref(Math.min(1, Math.max(0, answers.value.length - 1)))
const submitted = ref(false)
let advanceTimer = 0

const isCorrect = computed(
  () => submitted.value && isAnswerCorrect(props.question, draftIndex.value),
)
const showExplanation = computed(() => props.question.showExplanation === true)
const explanationText = computed(() => props.question.explanation.trim())
const points = computed(() =>
  submitted.value ? pointsForAnswer(props.question, draftIndex.value) : 0,
)
const awaitingContinue = computed(() => submitted.value && showExplanation.value)

watch(
  () => props.question.id,
  () => {
    submitted.value = false
    draftIndex.value = Math.min(1, Math.max(0, answers.value.length - 1))
    window.clearTimeout(advanceTimer)
  },
)

function answerState(index: number): 'default' | 'correct' | 'incorrect' | 'selected' {
  if (!submitted.value) {
    return draftIndex.value === index ? 'selected' : 'default'
  }
  if (showExplanation.value) {
    if (index === props.question.correctIndex) return 'correct'
    if (draftIndex.value === index && index !== props.question.correctIndex) return 'incorrect'
    return 'default'
  }
  return draftIndex.value === index ? 'selected' : 'default'
}

function submit(): void {
  if (submitted.value) return
  submitted.value = true
  emit('answer', draftIndex.value)
  if (!showExplanation.value) {
    advanceTimer = window.setTimeout(() => emit('complete'), 1600)
  }
}

function continueToNext(): void {
  emit('complete')
}

onBeforeUnmount(() => {
  window.clearTimeout(advanceTimer)
})
</script>

<template>
  <div class="process-question-card" role="dialog" aria-label="Severity question">
    <div v-if="submitted" class="process-points-pill" :class="isCorrect ? 'correct' : 'incorrect'">
      {{ points > 0 ? `+ ${points} pts` : '0 pts' }}
    </div>
    <p class="process-question-prompt">{{ question.questionText }}</p>
    <div class="process-severity-options">
      <button
        v-for="answer in answers"
        :key="answer.index"
        type="button"
        class="process-severity-option"
        :class="answerState(answer.index)"
        :disabled="submitted"
        @click="draftIndex = answer.index"
      >
        {{ answer.text }}
      </button>
    </div>
    <button
      v-if="!awaitingContinue"
      type="button"
      class="process-instruction-begin"
      :disabled="submitted"
      @click="submit"
    >
      Submit
    </button>
    <p v-if="awaitingContinue && explanationText" class="process-question-feedback">
      {{ explanationText }}
    </p>
    <button
      v-if="awaitingContinue"
      type="button"
      class="process-instruction-begin"
      @click="continueToNext"
    >
      Continue
    </button>
  </div>
</template>
