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
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import ProcessQuestionsForm from '@/components/author/ProcessQuestionsForm.vue'
import { useAuthorAutosave } from '@/composables/useAuthorAutosave'
import { useStudioAccess } from '@/composables/useStudioAccess'
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

const props = withDefaults(
  defineProps<{
    activityIdProp?: string
    embedded?: boolean
  }>(),
  { activityIdProp: undefined, embedded: false },
)

const route = useRoute()
const router = useRouter()
const activities = useActivityStore()
const { canEdit } = useStudioAccess()

const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const deleting = ref(false)
const publishing = ref(false)
const saveMessage = ref<string | null>(null)
let loadGeneration = 0
const title = ref('')
const description = ref('')
const process = ref<ProcessDefinition | null>(null)
const enableThird = ref(false)
const video1Questions = ref<{ snapshot: () => ProcessQuestionBank } | null>(null)

const activityId = computed(
  () => props.activityIdProp?.trim() || String(route.params.id ?? ''),
)
const isPublished = computed(
  () => activities.summaries.find((item) => item.id === activityId.value)?.published ?? false,
)
const editable = computed(() => canEdit(activities.current?.metadata.authorId))

const working = computed(() => {
  if (!process.value) return null
  return buildPersistableProcessDefinition(process.value, true, enableThird.value)
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
    process.value = {
      ...parsed,
      secondSegmentScoreThreshold: 100,
    }
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
    secondSegmentScoreThreshold: 100,
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

function flushVideo1Questions(): void {
  if (!process.value) return
  const bank = video1Questions.value?.snapshot()
  if (!bank) return
  const segments = [...process.value.segments]
  const current = segments[0] ?? createEmptyProcessSegment()
  segments[0] = { ...current, questions: bank }
  process.value = { ...process.value, segments }
}

async function save(origin: 'auto' | 'manual' = 'manual'): Promise<boolean> {
  if (!editable.value || !activities.current || !process.value) return false

  await nextTick()
  flushVideo1Questions()
  if (origin === 'manual') saving.value = true
  saveMessage.value = null
  try {
    const nextProcess = {
      ...buildPersistableProcessDefinition(process.value, true, enableThird.value),
      secondSegmentScoreThreshold: 100,
    }
    autosave.pause()
    process.value = nextProcess
    const next = writeProcessDefinition(activities.current, nextProcess)
    next.metadata.title = title.value.trim() || next.metadata.title
    next.metadata.description = description.value.trim()
    await nextTick()
    autosave.resume()
    await activities.save(next)
    activities.stagePreview(next)
    saveMessage.value = 'Saved'
    window.setTimeout(() => {
      saveMessage.value = null
    }, 2000)
    return true
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Failed to save process'
    if (origin === 'auto') {
      saveMessage.value = message
    } else {
      window.alert(message)
    }
    return false
  } finally {
    if (origin === 'manual') saving.value = false
  }
}

const autosave = useAuthorAutosave({
  editable,
  loading,
  save: () => save('auto'),
})

watch(
  process,
  () => {
    autosave.schedule()
  },
  { deep: true },
)

async function openPreview(): Promise<void> {
  if (!activityId.value) return
  if (editable.value) {
    const saved = await save()
    if (!saved) return
  }
  const query: Record<string, string> = { activity: activityId.value, preview: '1' }
  if (props.embedded) {
    const parentId = String(route.params.id ?? '')
    if (parentId) {
      query.mvp = parentId
      query.section = 'process'
    }
  }
  await router.push({ path: '/player', query })
}

async function publish(): Promise<void> {
  if (!editable.value || !activities.current) return
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
  if (props.embedded || !editable.value || !activities.current) return
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
  <div class="author-page" :class="{ 'is-embedded': embedded }">
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
          <RouterLink
            v-if="!embedded"
            to="/studio/process"
            class="author-back"
            aria-label="Back"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </RouterLink>
          <h1 class="author-header-title">{{ embedded ? 'Process' : 'Edit Process' }}</h1>
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
            v-if="editable && !embedded"
            variant="primary"
            :disabled="saving || publishing || deleting"
            @click="publish"
          >
            {{ publishing ? 'Publishing…' : 'Publish' }}
          </AuthorPillButton>
        </div>
      </div>

      <p v-if="!editable" class="author-readonly-banner">
        View only — you can open this scenario, but only the owner or an admin can edit it.
      </p>

      <fieldset class="author-stack" :disabled="!editable">
      <section class="author-stack-sm">
        <AuthorSectionHeader title="Instruction" />
        <p class="author-muted">
          Shown over the paused first frame of Video 1 until the learner taps Start.
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

      <template v-if="working.segments[1]">
        <section class="author-stack-sm">
          <AuthorSectionHeader title="Instruction" />
          <p class="author-muted">
            Shown over the paused first frame of Video 2 until the learner taps Start.
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
      </template>

      </fieldset>

      <div v-if="editable" class="author-actions">
        <AuthorPillButton variant="primary" :disabled="saving || deleting" @click="save">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M3.5 2.5h7.2L12.5 4.3V13.5H3.5V2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            <path d="M5.5 2.5v3.5h5V2.5M5.5 13.5v-4h5v4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          </svg>
          {{ saving ? 'Saving…' : 'Save' }}
        </AuthorPillButton>
        <AuthorPillButton
          v-if="!embedded"
          variant="ghost"
          :disabled="saving || deleting"
          @click="remove"
        >
          {{ deleting ? 'Removing…' : 'Remove' }}
        </AuthorPillButton>
        <p v-if="saveMessage" class="author-success">{{ saveMessage }}</p>
        <p v-if="activities.error" class="author-error">{{ activities.error }}</p>
      </div>
    </div>
  </div>
</template>
