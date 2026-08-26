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
const points = computed(() =>
  selectedIndex.value == null ? 0 : pointsForAnswer(props.question, selectedIndex.value),
)
/** Explanation + Continue only after an incorrect answer when the toggle is on. */
const awaitingContinue = computed(
  () => locked.value && showExplanation.value && !answeredCorrectly.value,
)

watch(
  () => props.question.id,
  () => {
    selectedIndex.value = null
    locked.value = false
    window.clearTimeout(advanceTimer)
  },
)

function answerState(index: number): 'default' | 'correct' | 'incorrect' {
  if (!locked.value || !showCorrectIncorrect.value) return 'default'
  if (awaitingContinue.value) {
    if (index === props.question.correctIndex) return 'correct'
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
  if (showExplanation.value && !isAnswerCorrect(props.question, index)) return
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
})
</script>

<template>
  <div
    class="process-question-card"
    :class="{ 'is-explained': awaitingContinue }"
    role="dialog"
    aria-label="Theory question"
  >
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
    <div
      v-if="awaitingContinue"
      class="process-question-reveal"
      :class="{ 'is-open': awaitingContinue }"
    >
      <div class="process-question-reveal-inner">
        <p v-if="explanationText" class="process-question-feedback">
          {{ explanationText }}
        </p>
        <button
          type="button"
          class="process-instruction-begin"
          :tabindex="awaitingContinue ? 0 : -1"
          @click="continueToNext"
        >
          Continue
        </button>
      </div>
    </div>
  </div>
</template>
