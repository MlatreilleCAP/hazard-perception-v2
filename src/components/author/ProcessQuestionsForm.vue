<script setup lang="ts">
import { ref, watch } from 'vue'
import { cloneJson } from '@/app/clone'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import AuthorToggle from '@/components/author/AuthorToggle.vue'
import {
  ANSWER_LABELS,
  createAnswerOption,
  createSeveritySurveyQuestion,
  createTheorySurveyQuestion,
  DEFAULT_ANSWER_POINTS,
  questionKindLabel,
  surveyQuestionIsConfigured,
  type ProcessQuestionBank,
  type ProcessQuestionKind,
  type ProcessSurveyQuestion,
} from '@/types/questions'

const props = withDefaults(
  defineProps<{
    segmentId: string
    modelValue: ProcessQuestionBank
    title?: string
    description?: string
  }>(),
  {
    title: 'Theory',
    description:
      'Add severity and theory questions from the dropdown. Theory questions are optional — if one is configured it is asked; otherwise it is skipped. Customize the text, answers, correct answer, and points for each answer. Use Up/Down to set the learner order.',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: ProcessQuestionBank]
}>()

const addKind = ref<ProcessQuestionKind | ''>('')
const addSelectKey = ref(0)
const questions = ref<ProcessSurveyQuestion[]>(
  props.modelValue.questions.map((question) => cloneJson(question)),
)

watch(
  () => props.segmentId,
  () => {
    questions.value = props.modelValue.questions.map((question) =>
      cloneJson(question),
    )
    addKind.value = ''
    addSelectKey.value += 1
  },
)

function commit(next: ProcessSurveyQuestion[]): void {
  questions.value = next
  emit('update:modelValue', { version: 2, questions: next })
}

function snapshot(): ProcessQuestionBank {
  return { version: 2, questions: questions.value.map((question) => cloneJson(question)) }
}

defineExpose({ snapshot })

function addQuestion(kind: ProcessQuestionKind | ''): void {
  if (!kind) return
  const question =
    kind === 'severity' ? createSeveritySurveyQuestion() : createTheorySurveyQuestion()
  commit([...questions.value, question])
  addKind.value = ''
  // Remount so the same kind can be chosen again without a second click.
  addSelectKey.value += 1
}

function updateQuestion(id: string, next: ProcessSurveyQuestion): void {
  commit(questions.value.map((item) => (item.id === id ? next : item)))
}

function removeQuestion(id: string): void {
  commit(questions.value.filter((item) => item.id !== id))
}

function moveQuestion(from: number, to: number): void {
  if (to < 0 || to >= questions.value.length) return
  const next = [...questions.value]
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)
  commit(next)
}

function setCorrect(question: ProcessSurveyQuestion, index: number): void {
  const answers = question.answers.map((answer, answerIndex) => {
    if (answerIndex !== index) return answer
    if (answer.points > 0) return answer
    return { ...answer, points: DEFAULT_ANSWER_POINTS }
  })
  updateQuestion(question.id, { ...question, correctIndex: index, answers })
}

function updateAnswer(
  question: ProcessSurveyQuestion,
  index: number,
  patch: { text?: string; points?: number },
): void {
  const answers = question.answers.map((answer, answerIndex) =>
    answerIndex === index ? { ...answer, ...patch } : answer,
  )
  updateQuestion(question.id, { ...question, answers })
}

function addAnswer(question: ProcessSurveyQuestion): void {
  if (question.answers.length >= 6) return
  updateQuestion(question.id, {
    ...question,
    answers: [...question.answers, createAnswerOption('', 0)],
  })
}

function removeAnswer(question: ProcessSurveyQuestion, index: number): void {
  if (question.answers.length <= 2) return
  const answers = question.answers.filter((_, answerIndex) => answerIndex !== index)
  const correctIndex = Math.min(question.correctIndex, answers.length - 1)
  updateQuestion(question.id, { ...question, answers, correctIndex })
}
</script>

<template>
  <section class="author-stack-sm">
    <AuthorSectionHeader :title="title">
      <template #action>
        <label :for="`${segmentId}-add-question`" class="sr-only">Add question</label>
        <select
          :id="`${segmentId}-add-question`"
          :key="addSelectKey"
          class="question-add"
          :value="addKind"
          @change="addQuestion(($event.target as HTMLSelectElement).value as ProcessQuestionKind | '')"
        >
          <option value="">Add question</option>
          <option value="severity">Severity question</option>
          <option value="theory">Theory question</option>
        </select>
      </template>
    </AuthorSectionHeader>

    <p class="author-muted">
      {{ description }}
    </p>

    <p v-if="questions.length === 0" class="author-list-empty author-muted" style="border: 1px dashed var(--editor-border); border-radius: 6px">
      No questions yet. Use “Add question” to create a severity or theory question.
    </p>

    <div v-else class="author-stack-sm">
      <article v-for="(question, index) in questions" :key="question.id" class="question-card">
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px">
          <div>
            <p class="question-kicker">
              {{ questionKindLabel(question.kind) }} · Question {{ index + 1 }}
            </p>
            <p v-if="!surveyQuestionIsConfigured(question)" class="author-muted" style="margin-top: 4px; font-size: 12px">
              Add question text and at least one answer.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 12px">
            <button type="button" class="ghost-mini" :disabled="index === 0" @click="moveQuestion(index, index - 1)">
              Up
            </button>
            <button
              type="button"
              class="ghost-mini"
              :disabled="index === questions.length - 1"
              @click="moveQuestion(index, index + 1)"
            >
              Down
            </button>
            <button type="button" class="link-button" style="color: #dc2626; text-decoration: none" @click="removeQuestion(question.id)">
              Remove
            </button>
          </div>
        </div>

        <AuthorField
          :id="`${question.id}-text`"
          v-model="question.questionText"
          label="Question text"
          multiline
          :rows="2"
          @update:model-value="updateQuestion(question.id, { ...question, questionText: $event })"
        />

        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px">
            <p class="author-field-label">Answers</p>
            <button type="button" class="link-button" :disabled="question.answers.length >= 6" @click="addAnswer(question)">
              Add answer
            </button>
          </div>

          <div class="author-stack-sm">
            <div
              v-for="(answer, answerIndex) in question.answers"
              :key="`${question.id}-answer-${answerIndex}`"
              class="answer-row"
            >
              <div class="answer-select">
                <button
                  type="button"
                  class="answer-dot"
                  :class="{ selected: question.correctIndex === answerIndex }"
                  :aria-label="`Mark answer ${ANSWER_LABELS[answerIndex] ?? answerIndex + 1} as correct`"
                  :aria-pressed="question.correctIndex === answerIndex"
                  @click="setCorrect(question, answerIndex)"
                >
                  <svg
                    v-if="question.correctIndex === answerIndex"
                    viewBox="0 0 10 8"
                    width="10"
                    height="8"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 4.2 3.6 6.8 9 1.2"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <span style="min-width: 0; flex: 1">
                  <span class="author-field-label">
                    Answer {{ ANSWER_LABELS[answerIndex] ?? answerIndex + 1 }}
                    {{ question.correctIndex === answerIndex ? ' · Correct' : '' }}
                  </span>
                  <input
                    type="text"
                    :value="answer.text"
                    :placeholder="`Answer ${ANSWER_LABELS[answerIndex] ?? answerIndex + 1} goes here`"
                    class="author-field-control"
                    @input="updateAnswer(question, answerIndex, { text: ($event.target as HTMLInputElement).value })"
                  />
                </span>
              </div>
              <div class="answer-points">
                <span class="author-field-label">Points</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  :value="answer.points"
                  @input="updateAnswer(question, answerIndex, { points: Math.max(0, Math.floor(Number(($event.target as HTMLInputElement).value) || 0)) })"
                />
              </div>
              <button
                type="button"
                class="link-button"
                style="text-decoration: none; color: var(--editor-muted)"
                :disabled="question.answers.length <= 2"
                @click="removeAnswer(question, answerIndex)"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        <AuthorToggle
          :id="`${question.id}-show-correct`"
          :model-value="question.showCorrectIncorrect !== false"
          label="Show correct / incorrect"
          description="When off, learners do not see correct or incorrect feedback or the score pill. If explanation is also off, the question advances immediately."
          @update:model-value="updateQuestion(question.id, { ...question, showCorrectIncorrect: $event })"
        />
        <AuthorToggle
          :id="`${question.id}-show-explanation`"
          :model-value="question.showExplanation !== false"
          label="Show explanation"
          description="When on, learners see the explanation and Continue only after an incorrect answer. Correct answers skip the explanation. It still appears on the results screen for incorrect answers."
          @update:model-value="updateQuestion(question.id, { ...question, showExplanation: $event })"
        />
        <AuthorField
          :id="`${question.id}-explanation`"
          :model-value="question.explanation"
          label="Explanation text"
          multiline
          :rows="2"
          @update:model-value="updateQuestion(question.id, { ...question, explanation: $event })"
        />
      </article>
    </div>
  </section>
</template>
