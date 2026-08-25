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

const selectedIndex = ref<number | null>(null)
const locked = ref(false)
let advanceTimer = 0

const answers = computed(() => configuredAnswerEntries(props.question))
const showExplanation = computed(() => props.question.showExplanation !== false)
const explanationText = computed(() => props.question.explanation.trim())
const feedback = computed(() => {
  if (!locked.value || selectedIndex.value == null) return null
  return isAnswerCorrect(props.question, selectedIndex.value) ? 'correct' : 'incorrect'
})
const points = computed(() =>
  selectedIndex.value == null ? 0 : pointsForAnswer(props.question, selectedIndex.value),
)
const awaitingContinue = computed(() => locked.value && showExplanation.value)

watch(
  () => props.question.id,
  () => {
    selectedIndex.value = null
    locked.value = false
    window.clearTimeout(advanceTimer)
  },
)

function answerState(index: number): 'default' | 'correct' | 'incorrect' {
  if (!locked.value) return 'default'
  if (showExplanation.value) {
    if (index === props.question.correctIndex) return 'correct'
    if (selectedIndex.value === index && index !== props.question.correctIndex) return 'incorrect'
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
  <div class="process-question-card" role="dialog" aria-label="Theory question">
    <div v-if="feedback" class="process-points-pill" :class="feedback">
      {{ points > 0 ? `+ ${points} pts` : '0 pts' }}
    </div>
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
