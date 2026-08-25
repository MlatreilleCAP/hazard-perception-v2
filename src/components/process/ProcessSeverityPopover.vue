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
const points = computed(() =>
  submitted.value ? pointsForAnswer(props.question, draftIndex.value) : 0,
)

watch(
  () => props.question.id,
  () => {
    submitted.value = false
    draftIndex.value = Math.min(1, Math.max(0, answers.value.length - 1))
    window.clearTimeout(advanceTimer)
  },
)

function submit(): void {
  if (submitted.value) return
  submitted.value = true
  emit('answer', draftIndex.value)
  advanceTimer = window.setTimeout(() => emit('complete'), 1600)
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
        :class="{ selected: draftIndex === answer.index }"
        :disabled="submitted"
        @click="draftIndex = answer.index"
      >
        {{ answer.text }}
      </button>
    </div>
    <button
      type="button"
      class="process-instruction-begin"
      :disabled="submitted"
      @click="submit"
    >
      Submit
    </button>
  </div>
</template>
