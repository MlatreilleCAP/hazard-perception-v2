<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  readAnticipateDefinition,
  writeAnticipateDefinition,
} from '@/activities/anticipateDefinition'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import ProcessQuestionsForm from '@/components/author/ProcessQuestionsForm.vue'
import { useActivityStore } from '@/stores/activityStore'
import {
  isAnticipateActivity,
  normalizeAnticipateDefinition,
  normalizeBranchQuestion,
  validateAnticipateForPublish,
  type AnticipateDefinition,
} from '@/types/anticipate'
import type { MediaRef } from '@/types/media'
import {
  ANSWER_LABELS,
  createTheorySurveyQuestion,
  type ProcessQuestionBank,
} from '@/types/questions'

const route = useRoute()
const router = useRouter()
const activities = useActivityStore()

const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const deleting = ref(false)
const publishing = ref(false)
const saveMessage = ref<string | null>(null)
let loadGeneration = 0
const title = ref('')
const description = ref('')
const titleError = ref<string | null>(null)
const anticipate = ref<AnticipateDefinition | null>(null)
const branchQuestionsForm = ref<{ snapshot: () => ProcessQuestionBank } | null>(null)
const postBranchQuestions = ref<{ snapshot: () => ProcessQuestionBank } | null>(null)
const remedialQuestionsForm = ref<{ snapshot: () => ProcessQuestionBank } | null>(null)

const activityId = computed(() => String(route.params.id ?? ''))
const isPublished = computed(
  () =>
    activities.summaries.find((item) => item.id === activityId.value)?.published ?? false,
)

const instructionText = computed({
  get: () => anticipate.value?.instructionText ?? '',
  set: (value: string) => {
    if (!anticipate.value) return
    anticipate.value = { ...anticipate.value, instructionText: value }
  },
})

const instructionPill = computed({
  get: () => anticipate.value?.instructionPill ?? 'Anticipate',
  set: (value: string) => {
    if (!anticipate.value) return
    anticipate.value = { ...anticipate.value, instructionPill: value }
  },
})

const branchQuestionBank = computed((): ProcessQuestionBank => ({
  version: 2,
  questions: anticipate.value ? [anticipate.value.branchQuestion] : [createTheorySurveyQuestion()],
}))

onMounted(async () => {
  await load()
})

watch(activityId, () => {
  void load()
})

async function load(): Promise<void> {
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = null
  try {
    await activities.refreshList()
    await activities.load(activityId.value)
    if (generation !== loadGeneration) return
    const current = activities.current
    if (!current || !isAnticipateActivity(current.metadata.tags)) {
      anticipate.value = null
      return
    }
    title.value = current.metadata.title
    description.value = current.metadata.description
    anticipate.value = readAnticipateDefinition(current)
  } catch (cause) {
    if (generation !== loadGeneration) return
    anticipate.value = null
    loadError.value =
      cause instanceof Error ? cause.message : 'Failed to load anticipate'
  } finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

function setMainMedia(media: MediaRef | null): void {
  if (!anticipate.value) return
  anticipate.value = { ...anticipate.value, media }
}

function setMainDuration(durationMs: number): void {
  if (!anticipate.value) return
  anticipate.value = {
    ...anticipate.value,
    durationMs: durationMs > 0 ? durationMs : anticipate.value.durationMs,
  }
}

function setDefaultBranchMedia(media: MediaRef | null): void {
  if (!anticipate.value) return
  anticipate.value = { ...anticipate.value, defaultBranchMedia: media }
}

function setAnswerMedia(index: number, media: MediaRef | null): void {
  if (!anticipate.value) return
  const branchMediaByAnswer = [...anticipate.value.branchMediaByAnswer]
  while (branchMediaByAnswer.length <= index) {
    branchMediaByAnswer.push(null)
  }
  branchMediaByAnswer[index] = media
  anticipate.value = { ...anticipate.value, branchMediaByAnswer }
}

function onBranchBankUpdate(bank: ProcessQuestionBank): void {
  if (!anticipate.value) return
  const nextQuestion = normalizeBranchQuestion(
    bank.questions[0] ?? createTheorySurveyQuestion(),
  )
  const previousMedia = anticipate.value.branchMediaByAnswer
  const branchMediaByAnswer = nextQuestion.answers.map(
    (_, index) => previousMedia[index] ?? null,
  )
  anticipate.value = {
    ...anticipate.value,
    branchQuestion: nextQuestion,
    branchMediaByAnswer,
  }
}

function setQuestions(questions: ProcessQuestionBank): void {
  if (!anticipate.value) return
  anticipate.value = { ...anticipate.value, questions }
}

function setRemedialMedia(media: MediaRef | null): void {
  if (!anticipate.value) return
  anticipate.value = { ...anticipate.value, remedialMedia: media }
}

function setRemedialQuestions(questions: ProcessQuestionBank): void {
  if (!anticipate.value) return
  anticipate.value = { ...anticipate.value, remedialQuestions: questions }
}

function flushQuestions(): void {
  if (!anticipate.value) return
  const branchBank = branchQuestionsForm.value?.snapshot()
  if (branchBank) {
    onBranchBankUpdate(branchBank)
  }
  const postBank = postBranchQuestions.value?.snapshot()
  if (postBank) {
    anticipate.value = { ...anticipate.value, questions: postBank }
  }
  const remedialBank = remedialQuestionsForm.value?.snapshot()
  if (remedialBank) {
    anticipate.value = { ...anticipate.value, remedialQuestions: remedialBank }
  }
}

async function save(): Promise<boolean> {
  if (!activities.current || !anticipate.value) return false
  titleError.value = title.value.trim() ? null : 'Title is required'
  if (titleError.value) return false

  await nextTick()
  flushQuestions()
  saving.value = true
  saveMessage.value = null
  try {
    const nextAnticipate = normalizeAnticipateDefinition(anticipate.value)
    anticipate.value = nextAnticipate
    const next = writeAnticipateDefinition(activities.current, nextAnticipate)
    next.metadata.title = title.value.trim()
    next.metadata.description = description.value.trim()
    await activities.save(next)
    activities.stagePreview(next)
    saveMessage.value = 'Saved'
    window.setTimeout(() => {
      saveMessage.value = null
    }, 2000)
    return true
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to save anticipate')
    return false
  } finally {
    saving.value = false
  }
}

async function openPreview(): Promise<void> {
  const saved = await save()
  if (!saved || !activityId.value) return
  await router.push({
    path: '/player',
    query: { activity: activityId.value, preview: '1' },
  })
}

async function publish(): Promise<void> {
  if (!activities.current || !anticipate.value) return
  flushQuestions()
  const publishError = validateAnticipateForPublish(anticipate.value)
  if (publishError) {
    window.alert(publishError)
    return
  }
  publishing.value = true
  try {
    const saved = await save()
    if (!saved || !activities.current) return
    await activities.publish(activities.current.id)
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to publish anticipate')
  } finally {
    publishing.value = false
  }
}

async function remove(): Promise<void> {
  if (!activities.current) return
  if (
    !window.confirm(
      'Remove this anticipate scenario from authoring and training? The record will be kept in the database.',
    )
  ) {
    return
  }
  deleting.value = true
  try {
    await activities.remove(activities.current.id)
    await router.push('/studio/anticipate')
  } catch (cause) {
    deleting.value = false
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove anticipate')
  }
}
</script>

<template>
  <div class="author-page">
    <div v-if="loading" class="author-page-inner">
      <p class="author-muted">Loading anticipate…</p>
    </div>

    <div
      v-else-if="!activities.current || !anticipate"
      class="author-page-inner author-stack-sm"
    >
      <p class="author-error">{{ loadError ?? activities.error ?? 'Anticipate not found' }}</p>
      <RouterLink to="/studio/anticipate">Back to list</RouterLink>
    </div>

    <div v-else class="author-page-inner author-stack">
      <div class="author-header-row">
        <div class="author-header-left">
          <RouterLink to="/studio/anticipate" class="author-back" aria-label="Back">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path
                d="M10 3.5 5.5 8 10 12.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </RouterLink>
          <h1 class="author-header-title">Edit Anticipate</h1>
          <AuthorStatusChip :label="isPublished ? 'PUBLISHED' : 'DRAFT'" />
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px">
          <AuthorPillButton
            variant="ghost"
            :disabled="saving || publishing || deleting"
            @click="openPreview"
          >
            {{ saving ? 'Saving…' : 'Preview' }}
          </AuthorPillButton>
          <AuthorPillButton
            variant="primary"
            :disabled="saving || publishing || deleting"
            @click="publish"
          >
            {{ publishing ? 'Publishing…' : 'Publish' }}
          </AuthorPillButton>
        </div>
      </div>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Hazard Info" />
        <AuthorField
          id="anticipate-title"
          v-model="title"
          label="Title"
          :error="titleError ?? undefined"
        />
        <AuthorField
          id="anticipate-description"
          v-model="description"
          label="Description"
          multiline
          :rows="1"
        />
        <p class="author-muted">Template: Freeze Frame - Branch</p>
      </section>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Instruction" />
        <p class="author-muted">
          Shown over the paused first frame of the main video until the learner taps Begin.
        </p>
        <AuthorField
          id="anticipate-instruction-pill"
          v-model="instructionPill"
          label="Pill label"
        />
        <AuthorField
          id="anticipate-instruction"
          v-model="instructionText"
          label="Instruction text"
          multiline
          :rows="3"
        />
      </section>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Main video" />
        <p class="author-muted">
          Plays to the end, then pauses on the last frame for the branch question.
        </p>
        <MediaUploadField
          :id="`${activityId}-main-video`"
          :activity-id="activityId"
          label="Main video"
          :model-value="anticipate.media"
          :instruction-text="instructionText"
          :instruction-pill="instructionPill"
          @update:model-value="setMainMedia"
          @duration="setMainDuration"
        />
        <p v-if="anticipate.durationMs > 0" class="author-muted">
          Video duration: {{ (anticipate.durationMs / 1000).toFixed(1) }}s
        </p>
      </section>

      <section class="author-stack-sm">
        <ProcessQuestionsForm
          ref="branchQuestionsForm"
          segment-id="anticipate-branch"
          title="Branch Question"
          description="Multiple-choice question shown when the main video ends. Each answer can point to a branch video; empty slots use the default branch video."
          :model-value="branchQuestionBank"
          @update:model-value="onBranchBankUpdate"
        />

        <div
          v-for="(answer, index) in anticipate.branchQuestion.answers"
          :key="`branch-media-${anticipate.branchQuestion.id}-${index}`"
          class="author-panel author-stack-sm"
        >
          <p class="author-field-label">
            Branch video {{ ANSWER_LABELS[index] ?? index + 1 }}
            <span v-if="answer.text.trim()" class="author-muted">
              — {{ answer.text.trim() }}
            </span>
          </p>
          <MediaUploadField
            :id="`${activityId}-branch-${index}`"
            :activity-id="activityId"
            :label="`Branch video ${ANSWER_LABELS[index] ?? index + 1} (optional)`"
            :model-value="anticipate.branchMediaByAnswer[index] ?? null"
            @update:model-value="setAnswerMedia(index, $event)"
          />
        </div>

        <MediaUploadField
          :id="`${activityId}-default-branch`"
          :activity-id="activityId"
          label="Default / fallback branch video"
          :model-value="anticipate.defaultBranchMedia"
          @update:model-value="setDefaultBranchMedia"
        />
      </section>

      <section class="author-stack-sm">
        <ProcessQuestionsForm
          ref="postBranchQuestions"
          segment-id="anticipate-post-branch"
          title="Theory"
          description="Severity and theory questions after the branch video. Customize the text, answers, correct answer, and points for each answer."
          :model-value="anticipate.questions"
          @update:model-value="setQuestions"
        />
      </section>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Coaching Lesson" />
        <p class="author-muted">
          After results, shown only when the learner did not answer every question above
          correctly. The coaching video plays first, then the severity and theory questions
          below.
        </p>
        <MediaUploadField
          :id="`${activityId}-remedial-video`"
          :activity-id="activityId"
          label="Remedial video"
          :model-value="anticipate.remedialMedia"
          @update:model-value="setRemedialMedia"
        />
        <ProcessQuestionsForm
          ref="remedialQuestionsForm"
          segment-id="anticipate-remedial"
          title="Remedial questions"
          description="Add a severity and theory question asked after the remedial video on the incorrect path."
          :model-value="anticipate.remedialQuestions"
          @update:model-value="setRemedialQuestions"
        />
      </section>

      <div class="author-actions">
        <AuthorPillButton variant="primary" :disabled="saving || deleting" @click="save">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path
              d="M3.5 2.5h7.2L12.5 4.3V13.5H3.5V2.5Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
            <path
              d="M5.5 2.5v3.5h5V2.5M5.5 13.5v-4h5v4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
          {{ saving ? 'Saving…' : 'Save' }}
        </AuthorPillButton>
        <AuthorPillButton variant="ghost" :disabled="saving || deleting" @click="remove">
          {{ deleting ? 'Removing…' : 'Remove' }}
        </AuthorPillButton>
        <p v-if="saveMessage" class="author-success">{{ saveMessage }}</p>
        <p v-if="activities.error" class="author-error">{{ activities.error }}</p>
      </div>
    </div>
  </div>
</template>
