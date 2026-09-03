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
const showRevealContent = ref(false)
const revealEl = ref<HTMLButtonElement | null>(null)
const cardEl = ref<HTMLElement | null>(null)
const answerBtnRefs = ref<HTMLButtonElement[]>([])
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
const awaitingContinue = computed(() => needsExplanation.value && revealExplanation.value)

watch(
  () => props.question.id,
  () => {
    for (const btn of answerBtnRefs.value) {
      btn.style.display = ''
      btn.style.opacity = ''
      btn.style.transform = ''
      btn.style.transition = ''
      btn.style.pointerEvents = ''
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
    if (index === props.question.correctIndex) return 'correct'
    if (selectedIndex.value === index) return 'incorrect'
    return 'default'
  }
  if (selectedIndex.value === index) {
    return index === props.question.correctIndex ? 'correct' : 'incorrect'
  }
  return 'default'
}

function runFadeAndSlide(): void {
  const btns = answerBtnRefs.value
  if (!btns.length) {
    revealExplanation.value = true
    return
  }

  const correctIdx = props.question.correctIndex
  let correctBtnI = -1
  for (let i = 0; i < btns.length; i++) {
    if (answers.value[i]?.index === correctIdx) { correctBtnI = i; break }
  }
  if (correctBtnI === -1) {
    revealExplanation.value = true
    return
  }

  const correctBtn = btns[correctBtnI]
  const firstBtn = btns[0]
  const dy = correctBtn.getBoundingClientRect().top - firstBtn.getBoundingClientRect().top
  const needsSlide = dy !== 0

  for (let i = 0; i < btns.length; i++) {
    const btn = btns[i]
    if (i === correctBtnI) {
      if (needsSlide) {
        btn.style.transition = 'none'
        btn.style.transform = 'translateY(0)'
        btn.offsetHeight
        btn.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
        btn.style.transform = `translateY(${-dy}px)`
      }
    } else {
      btn.style.transition = 'opacity 0.3s ease, transform 0.3s ease'
      btn.style.opacity = '0'
      btn.style.transform = 'scale(0.96)'
      btn.style.pointerEvents = 'none'
    }
  }

  const swapDelay = needsSlide ? 450 : 350
  revealTimer = window.setTimeout(async () => {
    const card = cardEl.value
    const fromH = card ? card.offsetHeight : 0

    for (let i = 0; i < btns.length; i++) {
      if (i !== correctBtnI) btns[i].style.display = 'none'
    }
    btns[correctBtnI].style.transition = 'none'
    btns[correctBtnI].style.transform = ''
    revealExplanation.value = true

    if (!card) {
      showRevealContent.value = true
      return
    }
    await nextTick()
    const toH = card.scrollHeight
    if (fromH && toH && fromH !== toH) {
      card.style.height = `${fromH}px`
      card.style.overflow = 'hidden'
      card.offsetHeight
      card.style.transition = 'height 0.35s cubic-bezier(0.22, 1, 0.36, 1)'
      card.style.height = `${toH}px`
      const onEnd = () => {
        card.style.height = ''
        card.style.overflow = ''
        card.style.transition = ''
        card.removeEventListener('transitionend', onEnd)
        showRevealContent.value = true
      }
      card.addEventListener('transitionend', onEnd)
    } else {
      showRevealContent.value = true
    }
  }, swapDelay)
}

function select(index: number): void {
  if (locked.value) return
  selectedIndex.value = index
  locked.value = true
  emit('answer', index)
  if (showExplanation.value && !isAnswerCorrect(props.question, index)) {
    revealTimer = window.setTimeout(runFadeAndSlide, REVEAL_DELAY_MS)
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
    ref="cardEl"
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
          ref="revealEl"
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
