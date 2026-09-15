<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import questionPassIcon from '@/assets/lesson/question-pass.svg'
import metricFailIcon from '@/assets/lesson/metric-fail.svg'
import {
  configuredAnswerEntries,
  explanationForOutcome,
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

const CORRECT_HIGHLIGHT_DELAY_MS = 1000
const ANIMATION_PAUSE_MS = 1000
const COLLAPSE_MS = 850
const COLLAPSE_EASE = 'cubic-bezier(0.33, 0, 0.2, 1)'

const selectedIndex = ref<number | null>(null)
const locked = ref(false)
const revealExplanation = ref(false)
const showRevealContent = ref(false)
const showCorrectHighlight = ref(false)
const cardEl = ref<HTMLElement | null>(null)
const answersEl = ref<HTMLElement | null>(null)
const answerBtnRefs = ref<HTMLButtonElement[]>([])
let revealTimer = 0

const answers = computed(() => configuredAnswerEntries(props.question))
const answeredCorrectly = computed(
  () => selectedIndex.value != null && isAnswerCorrect(props.question, selectedIndex.value),
)
const showFeedback = computed(
  () => locked.value && selectedIndex.value != null,
)
const explanationText = computed(() =>
  explanationForOutcome(props.question, answeredCorrectly.value),
)
const feedback = computed(() => {
  if (!showFeedback.value) return null
  return answeredCorrectly.value ? 'correct' : 'incorrect'
})

const holdsForContinue = computed(
  () => locked.value && selectedIndex.value != null,
)
const awaitingContinue = computed(() => holdsForContinue.value && revealExplanation.value)

watch(
  () => props.question.id,
  () => {
    for (const btn of answerBtnRefs.value) {
      btn.style.display = ''
      btn.style.opacity = ''
      btn.style.transform = ''
      btn.style.transition = ''
      btn.style.pointerEvents = ''
      btn.style.maxHeight = ''
      btn.style.minHeight = ''
      btn.style.paddingTop = ''
      btn.style.paddingBottom = ''
      btn.style.borderWidth = ''
      btn.style.overflow = ''
      btn.style.margin = ''
    }
    if (answersEl.value) {
      answersEl.value.style.gap = ''
      answersEl.value.style.transition = ''
    }
    if (cardEl.value) {
      cardEl.value.style.height = ''
      cardEl.value.style.overflow = ''
      cardEl.value.style.transition = ''
    }
    selectedIndex.value = null
    locked.value = false
    revealExplanation.value = false
    showRevealContent.value = false
    showCorrectHighlight.value = false
    window.clearTimeout(revealTimer)
  },
)

function answerState(index: number): 'default' | 'correct' | 'incorrect' {
  if (!locked.value || !showFeedback.value) return 'default'
  if (holdsForContinue.value) {
    if (index === props.question.correctIndex) {
      return showCorrectHighlight.value ? 'correct' : 'default'
    }
    if (selectedIndex.value === index) return 'incorrect'
    return 'default'
  }
  if (selectedIndex.value === index) {
    return index === props.question.correctIndex ? 'correct' : 'incorrect'
  }
  return 'default'
}

async function runFadeAndSlide(): Promise<void> {
  const btns = answerBtnRefs.value
  if (!btns.length) {
    revealExplanation.value = true
    showRevealContent.value = true
    return
  }

  const correctIdx = props.question.correctIndex
  let keepIndex = -1
  for (let i = 0; i < btns.length; i++) {
    if (answers.value[i]?.index === correctIdx) {
      keepIndex = i
      break
    }
  }
  if (keepIndex === -1) {
    revealExplanation.value = true
    showRevealContent.value = true
    return
  }

  const list = answersEl.value
  const dismissing = btns.filter((_, index) => index !== keepIndex)
  const collapse = `${COLLAPSE_MS}ms ${COLLAPSE_EASE}`

  revealExplanation.value = true
  await nextTick()

  for (const btn of dismissing) {
    btn.style.maxHeight = `${btn.offsetHeight}px`
    btn.style.overflow = 'hidden'
  }
  if (list) {
    list.style.transition = `gap ${collapse}`
  }
  void list?.offsetHeight

  if (list) list.style.gap = '0px'
  for (const btn of dismissing) {
    btn.style.transition = [
      `opacity 0.5s ${COLLAPSE_EASE}`,
      `max-height ${collapse}`,
      `min-height ${collapse}`,
      `padding ${collapse}`,
      `border-width ${collapse}`,
    ].join(', ')
    btn.style.opacity = '0'
    btn.style.maxHeight = '0'
    btn.style.minHeight = '0'
    btn.style.paddingTop = '0'
    btn.style.paddingBottom = '0'
    btn.style.borderWidth = '0'
    btn.style.pointerEvents = 'none'
  }

  revealTimer = window.setTimeout(() => {
    for (const btn of dismissing) {
      btn.style.display = 'none'
    }
    if (list) {
      list.style.transition = ''
    }
    showRevealContent.value = true
  }, COLLAPSE_MS)
}

function select(index: number): void {
  if (locked.value) return
  selectedIndex.value = index
  locked.value = true
  emit('answer', index)
  const correct = isAnswerCorrect(props.question, index)
  if (correct) {
    showCorrectHighlight.value = true
    revealTimer = window.setTimeout(runFadeAndSlide, ANIMATION_PAUSE_MS)
    return
  }
  revealTimer = window.setTimeout(() => {
    showCorrectHighlight.value = true
    revealTimer = window.setTimeout(runFadeAndSlide, ANIMATION_PAUSE_MS)
  }, CORRECT_HIGHLIGHT_DELAY_MS)
}

function continueToNext(): void {
  emit('complete')
}

onBeforeUnmount(() => {
  window.clearTimeout(revealTimer)
})
</script>

<template>
  <div
    ref="cardEl"
    class="process-question-card is-theory"
    :class="{
      'is-explained': awaitingContinue,
      'is-continue-only': awaitingContinue && !explanationText,
    }"
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
    <div ref="answersEl" class="process-theory-answers">
      <button
        v-for="(answer, i) in answers"
        :ref="(el) => { if (el) answerBtnRefs[i] = el as HTMLButtonElement }"
        :key="answer.index"
        type="button"
        class="process-theory-answer"
        :class="answerState(answer.index)"
        :disabled="locked"
        @click="select(answer.index)"
      >
        {{ answer.text }}
      </button>
      <template v-if="awaitingContinue">
        <p
          v-if="explanationText"
          class="process-theory-explanation-inline"
          :class="{ 'is-visible': showRevealContent }"
        >
          {{ explanationText }}
        </p>
        <button
          type="button"
          class="process-question-continue"
          :class="{ 'is-visible': showRevealContent }"
          @click="continueToNext"
        >
          Continue
        </button>
      </template>
    </div>
  </div>
</template>
