<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  readProcessDefinition,
  writeProcessDefinition,
} from '@/activities/processDefinition'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import AuthorToggle from '@/components/author/AuthorToggle.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import ProcessQuestionsForm from '@/components/author/ProcessQuestionsForm.vue'
import { useActivityStore } from '@/stores/activityStore'
import type { MediaRef } from '@/types/media'
import {
  buildPersistableProcessDefinition,
  createEmptyProcessSegment,
  isProcessActivity,
  type ProcessDefinition,
  type ProcessSegmentIndex,
} from '@/types/process'
import type { ProcessQuestionBank } from '@/types/questions'

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
const process = ref<ProcessDefinition | null>(null)
const enableSecond = ref(false)
const enableThird = ref(false)
const video1Questions = ref<{ snapshot: () => ProcessQuestionBank } | null>(null)

const activityId = computed(() => String(route.params.id ?? ''))
const isPublished = computed(
  () => activities.summaries.find((item) => item.id === activityId.value)?.published ?? false,
)

const working = computed(() => {
  if (!process.value) return null
  return buildPersistableProcessDefinition(
    process.value,
    enableSecond.value,
    enableThird.value,
  )
})

const instructionText = computed({
  get: () => process.value?.instructionText ?? '',
  set: (value: string) => {
    if (!process.value) return
    process.value = { ...process.value, instructionText: value }
  },
})

const instructionPill = computed({
  get: () => process.value?.instructionPill ?? 'Process',
  set: (value: string) => {
    if (!process.value) return
    process.value = { ...process.value, instructionPill: value }
  },
})

const secondInstructionText = computed({
  get: () => process.value?.secondInstructionText ?? '',
  set: (value: string) => {
    if (!process.value) return
    process.value = { ...process.value, secondInstructionText: value }
  },
})

const secondInstructionPill = computed({
  get: () => process.value?.secondInstructionPill ?? 'Process',
  set: (value: string) => {
    if (!process.value) return
    process.value = { ...process.value, secondInstructionPill: value }
  },
})

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
    if (!current || !isProcessActivity(current.metadata.tags)) {
      process.value = null
      return
    }
    title.value = current.metadata.title
    description.value = current.metadata.description
    const parsed = readProcessDefinition(current)
    process.value = parsed
    enableSecond.value = parsed.segments.length > 1
    enableThird.value = parsed.segments.length > 2
  } catch (cause) {
    if (generation !== loadGeneration) return
    process.value = null
    loadError.value =
      cause instanceof Error ? cause.message : 'Failed to load process'
  } finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

function patchSegment(
  index: ProcessSegmentIndex,
  patch: Partial<NonNullable<ProcessDefinition['segments'][number]>>,
): void {
  if (!process.value) return
  const segments = [...process.value.segments]
  const current = segments[index] ?? createEmptyProcessSegment()
  segments[index] = { ...current, ...patch }
  process.value = {
    ...process.value,
    segments,
    secondSegmentScoreThreshold:
      index > 0 ? (process.value.secondSegmentScoreThreshold ?? 70) : process.value.secondSegmentScoreThreshold,
    thirdSegmentScoreThreshold: null,
  }
}

function setQuestions(index: ProcessSegmentIndex, questions: ProcessQuestionBank): void {
  patchSegment(index, { questions })
}

function setMedia(index: ProcessSegmentIndex, media: MediaRef | null): void {
  patchSegment(index, { media })
}

function setDuration(index: ProcessSegmentIndex, durationMs: number): void {
  const current = process.value?.segments[index]
  patchSegment(index, {
    durationMs: durationMs > 0 ? durationMs : current?.durationMs ?? 0,
  })
}

function onEnableSecond(checked: boolean): void {
  enableSecond.value = checked
  if (!checked) {
    enableThird.value = false
    return
  }
  if (!process.value) return
  if (!process.value.segments[1]) {
    process.value = {
      ...process.value,
      segments: [process.value.segments[0] ?? createEmptyProcessSegment(), createEmptyProcessSegment()],
      secondSegmentScoreThreshold: process.value.secondSegmentScoreThreshold ?? 70,
      thirdSegmentScoreThreshold: null,
    }
  }
}

function onEnableThird(checked: boolean): void {
  enableThird.value = checked
  if (!checked || !process.value) return
  const segmentTwo = process.value.segments[1] ?? createEmptyProcessSegment()
  if (!process.value.segments[2]) {
    process.value = {
      ...process.value,
      version: 1,
      segments: [
        process.value.segments[0] ?? createEmptyProcessSegment(),
        segmentTwo,
        createEmptyProcessSegment(),
      ],
      secondSegmentScoreThreshold: process.value.secondSegmentScoreThreshold ?? 70,
      thirdSegmentScoreThreshold: null,
    }
  }
}

function flushVideo1Questions(): void {
  if (!process.value) return
  const bank = video1Questions.value?.snapshot()
  if (!bank) return
  const segments = [...process.value.segments]
  const current = segments[0] ?? createEmptyProcessSegment()
  segments[0] = { ...current, questions: bank }
  process.value = { ...process.value, segments }
}

async function save(): Promise<boolean> {
  if (!activities.current || !process.value) return false
  titleError.value = title.value.trim() ? null : 'Title is required'
  if (titleError.value) return false

  await nextTick()
  flushVideo1Questions()
  saving.value = true
  saveMessage.value = null
  try {
    const nextProcess = buildPersistableProcessDefinition(
      process.value,
      enableSecond.value,
      enableThird.value,
    )
    process.value = nextProcess
    const next = writeProcessDefinition(activities.current, nextProcess)
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
    window.alert(cause instanceof Error ? cause.message : 'Failed to save process')
    return false
  } finally {
    saving.value = false
  }
}

async function openPreview(): Promise<void> {
  const saved = await save()
  if (!saved || !activityId.value) return
  await router.push({ path: '/player', query: { activity: activityId.value, preview: '1' } })
}

async function publish(): Promise<void> {
  if (!activities.current) return
  const current = working.value
  if (!current?.segments[0]?.media?.media_asset_id) {
    window.alert('Add Video 1 before publishing.')
    return
  }
  publishing.value = true
  try {
    const saved = await save()
    if (!saved || !activities.current) return
    await activities.publish(activities.current.id)
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to publish process')
  } finally {
    publishing.value = false
  }
}

async function remove(): Promise<void> {
  if (!activities.current) return
  if (
    !window.confirm(
      'Remove this process scenario from authoring and training? The record will be kept in the database.',
    )
  ) {
    return
  }
  deleting.value = true
  try {
    await activities.remove(activities.current.id)
    await router.push('/studio/process')
  } catch (cause) {
    deleting.value = false
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove process')
  }
}
</script>

<template>
  <div class="author-page">
    <div v-if="loading" class="author-page-inner">
      <p class="author-muted">Loading process…</p>
    </div>

    <div v-else-if="!activities.current || !working" class="author-page-inner author-stack-sm">
      <p class="author-error">{{ loadError ?? activities.error ?? 'Process not found' }}</p>
      <RouterLink to="/studio/process">Back to list</RouterLink>
    </div>

    <div v-else class="author-page-inner author-stack">
      <div class="author-header-row">
        <div class="author-header-left">
          <RouterLink to="/studio/process" class="author-back" aria-label="Back">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </RouterLink>
          <h1 class="author-header-title">Edit Process</h1>
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
        <AuthorField id="process-title" v-model="title" label="Title" :error="titleError ?? undefined" />
        <AuthorField id="process-description" v-model="description" label="Description" multiline :rows="1" />
      </section>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Instruction" />
        <p class="author-muted">
          Shown over the paused first frame of Video 1 until the learner taps Begin.
        </p>
        <AuthorField
          id="process-instruction-pill"
          v-model="instructionPill"
          label="Pill label"
        />
        <AuthorField
          id="process-instruction"
          v-model="instructionText"
          label="Instruction text"
          multiline
          :rows="3"
        />
      </section>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Process Video Clip" />
        <p class="author-muted">Upload a video or add one from the media library.</p>
        <MediaUploadField
          :id="`${activityId}-video-1`"
          :activity-id="activityId"
          label="Video 1"
          :model-value="working.segments[0]?.media ?? null"
          :instruction-text="instructionText"
          :instruction-pill="instructionPill"
          @update:model-value="setMedia(0, $event)"
          @duration="setDuration(0, $event)"
        />
      </section>

      <ProcessQuestionsForm
        ref="video1Questions"
        :segment-id="process?.segments[0]?.id ?? 'segment-1'"
        :model-value="process?.segments[0]?.questions ?? { version: 2, questions: [] }"
        @update:model-value="setQuestions(0, $event)"
      />

      <section class="author-panel">
        <AuthorToggle
          :id="`${activityId}-enable-second`"
          :model-value="enableSecond"
          label="Add second video"
          description="Shown to learners when their video 1 score is below the threshold."
          @update:model-value="onEnableSecond"
        />
        <AuthorField
          v-if="enableSecond"
          :id="`${activityId}-threshold-2`"
          :model-value="String(working.secondSegmentScoreThreshold ?? 70)"
          label="Show video 2 when video 1 score is below (%)"
          type="number"
          @update:model-value="
            process &&
              (process = {
                ...process,
                secondSegmentScoreThreshold: Math.min(100, Math.max(0, Math.round(Number($event) || 0))),
              })
          "
        />
      </section>

      <template v-if="enableSecond && working.segments[1]">
        <section class="author-stack-sm">
          <AuthorSectionHeader title="Instruction" />
          <p class="author-muted">
            Shown over the paused first frame of Video 2 until the learner taps Begin.
          </p>
          <AuthorField
            id="process-second-instruction-pill"
            v-model="secondInstructionPill"
            label="Pill label"
          />
          <AuthorField
            id="process-second-instruction"
            v-model="secondInstructionText"
            label="Instruction text"
            multiline
            :rows="3"
          />
        </section>

        <section class="author-stack-sm">
          <AuthorSectionHeader title="Video 2" />
          <p class="author-muted">
            Remedial video shown when the learner scores below the video 1 threshold.
          </p>
          <MediaUploadField
            :id="`${activityId}-video-2`"
            :activity-id="activityId"
            label="Video 2"
            :model-value="working.segments[1].media"
            :instruction-text="secondInstructionText"
            :instruction-pill="secondInstructionPill"
            @update:model-value="setMedia(1, $event)"
            @duration="setDuration(1, $event)"
          />
        </section>

        <ProcessQuestionsForm
          :key="working.segments[1].id"
          :segment-id="working.segments[1].id"
          :model-value="working.segments[1].questions"
          @update:model-value="setQuestions(1, $event)"
        />

        <section class="author-panel">
          <AuthorToggle
            :id="`${activityId}-enable-third`"
            :model-value="enableThird"
            label="Add third video"
            description="Always shown after video 1. If video 2 is required by the score threshold, it plays first."
            @update:model-value="onEnableThird"
          />
        </section>
      </template>

      <section v-if="enableSecond && enableThird && working.segments[2]" class="author-stack-sm">
        <AuthorSectionHeader title="Video 3" />
        <p class="author-muted">
          Always shown after video 1 (and after video 2 when it plays). Video 3 has
          no questions — comprehension ends when it finishes.
        </p>
        <MediaUploadField
          :id="`${activityId}-video-3`"
          :activity-id="activityId"
          label="Video 3"
          :model-value="working.segments[2].media"
          @update:model-value="setMedia(2, $event)"
          @duration="setDuration(2, $event)"
        />
      </section>

      <div class="author-actions">
        <AuthorPillButton variant="primary" :disabled="saving || deleting" @click="save">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M3.5 2.5h7.2L12.5 4.3V13.5H3.5V2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            <path d="M5.5 2.5v3.5h5V2.5M5.5 13.5v-4h5v4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
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
