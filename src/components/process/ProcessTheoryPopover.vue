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

watch(
  () => props.question.id,
  () => {
    selectedIndex.value = null
    locked.value = false
    window.clearTimeout(advanceTimer)
  },
)

function visualState(index: number): 'default' | 'correct' | 'incorrect' {
  if (selectedIndex.value !== index) return 'default'
  return index === props.question.correctIndex ? 'correct' : 'incorrect'
}

function select(index: number): void {
  if (locked.value) return
  selectedIndex.value = index
  locked.value = true
  emit('answer', index)
  const delay = showExplanation.value && explanationText.value ? 2800 : 1600
  advanceTimer = window.setTimeout(() => emit('complete'), delay)
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
        :class="visualState(answer.index)"
        :disabled="locked && selectedIndex !== answer.index"
        @click="select(answer.index)"
      >
        {{ answer.text }}
      </button>
    </div>
    <p v-if="feedback && showExplanation && explanationText" class="process-question-feedback">
      {{ explanationText }}
    </p>
  </div>
</template>
