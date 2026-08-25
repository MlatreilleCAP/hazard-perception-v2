<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { readSeeDefinition, writeSeeDefinition } from '@/activities/seeDefinition'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import SeeTimelineEditor from '@/components/author/SeeTimelineEditor.vue'
import { useActivityStore } from '@/stores/activityStore'
import type { MediaRef } from '@/types/media'
import {
  SEE_DIFFICULTIES,
  isSeeActivity,
  type SeeDefinition,
  type SeeDifficulty,
  type SeeHazard,
} from '@/types/see'

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
const see = ref<SeeDefinition | null>(null)

const activityId = computed(() => String(route.params.id ?? ''))
const isPublished = computed(
  () => activities.summaries.find((item) => item.id === activityId.value)?.published ?? false,
)

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
    if (!current || !isSeeActivity(current.metadata.tags)) {
      see.value = null
      return
    }
    title.value = current.metadata.title
    description.value = current.metadata.description
    see.value = readSeeDefinition(current)
  } catch (cause) {
    if (generation !== loadGeneration) return
    see.value = null
    loadError.value = cause instanceof Error ? cause.message : 'Failed to load scenario'
  } finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

function setMedia(media: MediaRef | null): void {
  if (!see.value) return
  see.value = { ...see.value, media }
}

function setDurationMs(durationMs: number): void {
  if (!see.value) return
  const duration = durationMs > 0 ? durationMs / 1000 : see.value.duration
  see.value = { ...see.value, duration }
}

function setDurationSeconds(duration: number): void {
  if (!see.value) return
  see.value = { ...see.value, duration: duration > 0 ? duration : see.value.duration }
}

function setHazards(hazards: SeeHazard[]): void {
  if (!see.value) return
  see.value = { ...see.value, hazards }
}

function setDifficulty(value: string): void {
  if (!see.value) return
  const difficulty = (SEE_DIFFICULTIES as readonly string[]).includes(value)
    ? (value as SeeDifficulty)
    : 'medium'
  see.value = { ...see.value, difficulty }
}

async function save(): Promise<boolean> {
  if (!activities.current || !see.value) return false
  titleError.value = title.value.trim() ? null : 'Title is required'
  if (titleError.value) return false

  await nextTick()
  saving.value = true
  saveMessage.value = null
  try {
    const next = writeSeeDefinition(activities.current, see.value)
    next.metadata.title = title.value.trim()
    next.metadata.description = description.value.trim()
    await activities.save(next)
    activities.stagePreview(next)
    see.value = readSeeDefinition(next)
    saveMessage.value = 'Saved'
    window.setTimeout(() => {
      saveMessage.value = null
    }, 2000)
    return true
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to save scenario')
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
  if (!see.value?.media?.media_asset_id) {
    window.alert('Add a video before publishing.')
    return
  }
  if (see.value.hazards.length === 0) {
    window.alert('Add at least one hazard before publishing.')
    return
  }
  publishing.value = true
  try {
    const saved = await save()
    if (!saved || !activities.current) return
    await activities.publish(activities.current.id)
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to publish scenario')
  } finally {
    publishing.value = false
  }
}

async function remove(): Promise<void> {
  if (!activities.current) return
  if (
    !window.confirm(
      'Remove this scenario from authoring and training? The record will be kept in the database.',
    )
  ) {
    return
  }
  deleting.value = true
  try {
    await activities.remove(activities.current.id)
    await router.push('/studio/see')
  } catch (cause) {
    deleting.value = false
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove scenario')
  }
}
</script>

<template>
  <div class="author-page">
    <div v-if="loading" class="author-page-inner">
      <p class="author-muted">Loading scenario…</p>
    </div>

    <div v-else-if="!activities.current || !see" class="author-page-inner author-stack-sm">
      <p class="author-error">{{ loadError ?? activities.error ?? 'Scenario not found' }}</p>
      <RouterLink to="/studio/see">Back to list</RouterLink>
    </div>

    <div v-else class="author-page-inner author-stack">
      <div class="author-header-row">
        <div class="author-header-left">
          <RouterLink to="/studio/see" class="author-back" aria-label="Back">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </RouterLink>
          <h1 class="author-header-title">New Hazard</h1>
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
        <AuthorField id="see-title" v-model="title" label="Title" placeholder="Hazard Title goes here" :error="titleError ?? undefined" />
        <AuthorField id="see-description" v-model="description" label="Description" placeholder="Description" multiline :rows="1" />
        <AuthorField
          id="see-difficulty"
          :model-value="see.difficulty"
          label="Difficulty"
          :options="SEE_DIFFICULTIES"
          placeholder="Select difficulty"
          @update:model-value="setDifficulty"
        />
      </section>

      <section v-if="!see.media" class="author-stack-sm">
        <AuthorSectionHeader title="Add Video" />
        <p class="author-muted">Upload a video or add one from the media library.</p>
        <MediaUploadField
          :id="`${activityId}-video`"
          :activity-id="activityId"
          label="Scenario video"
          :model-value="see.media"
          @update:model-value="setMedia"
          @duration="setDurationMs"
        />
      </section>

      <SeeTimelineEditor
        v-else
        :activity-id="activityId"
        :media="see.media"
        :duration="see.duration"
        :hazards="see.hazards"
        @update:media="setMedia"
        @update:duration="setDurationSeconds"
        @update:hazards="setHazards"
      />

      <div class="author-actions">
        <AuthorPillButton variant="primary" :disabled="saving || deleting" @click="save">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M3.5 2.5h7.2L12.5 4.3V13.5H3.5V2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            <path d="M5.5 2.5v3.5h5V2.5M5.5 13.5v-4h5v4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          </svg>
          {{ saving ? 'Saving…' : 'Save' }}
        </AuthorPillButton>
        <AuthorPillButton variant="ghost" :disabled="saving || deleting" @click="remove">
          {{ deleting ? 'Removing…' : 'Remove scenario' }}
        </AuthorPillButton>
        <p v-if="saveMessage" class="author-success">{{ saveMessage }}</p>
        <p v-if="activities.error" class="author-error">{{ activities.error }}</p>
      </div>
    </div>
  </div>
</template>
