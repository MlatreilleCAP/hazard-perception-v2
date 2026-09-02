<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  readIntroductionDefinition,
  writeIntroductionDefinition,
} from '@/activities/introductionDefinition'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSelectField from '@/components/author/AuthorSelectField.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import AuthorToggle from '@/components/author/AuthorToggle.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import { services } from '@/app/container'
import { duplicateIntroductionVersion } from '@/services/createIntroduction'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { useActivityStore } from '@/stores/activityStore'
import {
  LESSON_COUNTRY_OPTIONS,
  LESSON_LANGUAGE_OPTIONS,
} from '@/lib/inroadsMvp/packageSpec'
import { lessonVersionKey, lessonVersionLabel } from '@/lib/inroadsMvp/lessonVersions'
import {
  isIntroductionActivity,
  type IntroductionDefinition,
} from '@/types/introduction'
import type { MediaRef } from '@/types/media'

const route = useRoute()
const router = useRouter()
const activities = useActivityStore()
const { canEdit } = useStudioAccess()

const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const publishing = ref(false)
const deleting = ref(false)
const creatingVersion = ref(false)
const saveMessage = ref<string | null>(null)
const title = ref('')
const description = ref('')
const titleError = ref<string | null>(null)
const introduction = ref<IntroductionDefinition | null>(null)

type IntroductionVersionOption = {
  id: string
  label: string
}

const versions = ref<IntroductionVersionOption[]>([])
let loadGeneration = 0

const activityId = computed(() => String(route.params.id ?? ''))
const isPublished = computed(
  () => activities.summaries.find((item) => item.id === activityId.value)?.published ?? false,
)
const editable = computed(() => canEdit(activities.current?.metadata.authorId))

const versionSelectOptions = computed(() => {
  if (!versions.value.length) {
    return [
      {
        value: activityId.value,
        label: lessonVersionLabel(country.value, language.value, isPublished.value),
      },
    ]
  }
  return versions.value.map((item) => ({ value: item.id, label: item.label }))
})

function selectOptions(options: readonly string[], current: string): string[] {
  if (!current.trim() || options.includes(current)) return [...options]
  return [current, ...options]
}

const country = computed({
  get: () => introduction.value?.country ?? '',
  set: (value: string) => {
    if (!introduction.value) return
    introduction.value = { ...introduction.value, country: value }
  },
})

const language = computed({
  get: () => introduction.value?.language ?? '',
  set: (value: string) => {
    if (!introduction.value) return
    introduction.value = { ...introduction.value, language: value }
  },
})

async function loadVersions(
  currentTitle: string,
  currentIntro: IntroductionDefinition,
): Promise<IntroductionVersionOption[]> {
  const key = lessonVersionKey(currentTitle)
  const siblings = activities.summaries.filter(
    (item) => isIntroductionActivity(item.tags) && lessonVersionKey(item.title) === key,
  )
  if (!siblings.some((item) => item.id === activityId.value)) {
    siblings.unshift({
      id: activityId.value,
      title: currentTitle,
      version: 0,
      updatedAt: '',
      published: false,
      tags: [],
      createdBy: null,
    })
  }
  const rows = await Promise.all(
    siblings.map(async (item) => {
      if (item.id === activityId.value) {
        return {
          id: item.id,
          label: lessonVersionLabel(
            currentIntro.country,
            currentIntro.language,
            item.published,
          ),
        }
      }
      try {
        const definition = await services.persistence.getById(item.id)
        const parsed = definition ? readIntroductionDefinition(definition) : null
        return {
          id: item.id,
          label: lessonVersionLabel(
            parsed?.country ?? '',
            parsed?.language ?? '',
            item.published,
          ),
        }
      } catch {
        return {
          id: item.id,
          label: lessonVersionLabel('', '', item.published),
        }
      }
    }),
  )
  return rows.sort((a, b) => a.label.localeCompare(b.label))
}

function onVersionSelect(nextId: string): void {
  if (!nextId || nextId === activityId.value) return
  void router.push(`/studio/stand-alone-video/${nextId}`)
}

async function createVersion(): Promise<void> {
  if (!editable.value || !introduction.value || creatingVersion.value) return
  const saved = await saveIntro()
  if (!saved) return
  creatingVersion.value = true
  try {
    const nextId = await duplicateIntroductionVersion(activityId.value)
    await activities.refreshList()
    await router.push(`/studio/stand-alone-video/${nextId}`)
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to create version')
  } finally {
    creatingVersion.value = false
  }
}

async function load(): Promise<void> {
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = null
  try {
    await activities.refreshList()
    await activities.load(activityId.value)
    if (generation !== loadGeneration) return
    const current = activities.current
    if (!current || !isIntroductionActivity(current.metadata.tags)) {
      introduction.value = null
      loadError.value = 'Stand Alone Video not found'
      return
    }
    title.value = current.metadata.title
    description.value = current.metadata.description
    introduction.value = readIntroductionDefinition(current)
    const nextVersions = await loadVersions(current.metadata.title, introduction.value)
    if (generation !== loadGeneration) return
    versions.value = nextVersions
  } catch (cause) {
    if (generation !== loadGeneration) return
    introduction.value = null
    loadError.value = cause instanceof Error ? cause.message : 'Failed to load stand alone video'
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

onMounted(() => {
  void load()
})

watch(activityId, () => {
  void load()
})

watch([country, language, isPublished], () => {
  const id = activityId.value
  versions.value = versions.value.map((item) =>
    item.id === id
      ? {
          ...item,
          label: lessonVersionLabel(country.value, language.value, isPublished.value),
        }
      : item,
  )
})

function setIntroMedia(media: MediaRef | null): void {
  if (!editable.value || !introduction.value) return
  introduction.value = { ...introduction.value, introMedia: media }
}

function setIntroFirstVisit(value: boolean): void {
  if (!editable.value || !introduction.value) return
  introduction.value = { ...introduction.value, introShowOnFirstVisitOnly: value }
}

async function saveIntro(): Promise<boolean> {
  if (!editable.value || !introduction.value) return false
  titleError.value = title.value.trim() ? null : 'Title is required'
  if (titleError.value) return false

  saving.value = true
  saveMessage.value = null
  try {
    if (!activities.current || activities.current.id !== activityId.value) {
      await activities.load(activityId.value)
    }
    if (!activities.current || !introduction.value) return false
    const next = writeIntroductionDefinition(activities.current, introduction.value)
    next.metadata = {
      ...next.metadata,
      title: title.value.trim(),
      description: description.value.trim(),
    }
    await activities.save(next)
    versions.value = await loadVersions(next.metadata.title, introduction.value)
    saveMessage.value = 'Saved'
    window.setTimeout(() => {
      saveMessage.value = null
    }, 2000)
    return true
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to save stand alone video')
    return false
  } finally {
    saving.value = false
  }
}

async function openPreview(): Promise<void> {
  if (!activityId.value) return
  if (editable.value) {
    const saved = await saveIntro()
    if (!saved) return
  }
  if (activities.current) {
    activities.stagePreview(activities.current)
  }
  await router.push({
    path: '/player',
    query: {
      activity: activityId.value,
      preview: '1',
      intro: '1',
    },
  })
}

async function publish(): Promise<void> {
  if (!editable.value) return
  if (!introduction.value?.introMedia?.media_asset_id) {
    window.alert('Add a video before publishing.')
    return
  }
  publishing.value = true
  try {
    const saved = await saveIntro()
    if (!saved || !activities.current) return
    await activities.publish(activities.current.id)
    saveMessage.value = 'Published'
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to publish stand alone video')
  } finally {
    publishing.value = false
  }
}

async function removeCurrentVersion(): Promise<void> {
  if (!editable.value || !introduction.value) return
  const siblingId = versions.value.find((item) => item.id !== activityId.value)?.id ?? ''
  deleting.value = true
  try {
    await activities.remove(activityId.value)
    await router.push(
      siblingId ? `/studio/stand-alone-video/${siblingId}` : '/studio/stand-alone-video',
    )
  } catch (cause) {
    deleting.value = false
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove version')
  }
}

async function removeVersion(): Promise<void> {
  if (!editable.value || !introduction.value || deleting.value) return
  const label = lessonVersionLabel(country.value, language.value, isPublished.value)
  const hasSibling = versions.value.some((item) => item.id !== activityId.value)
  const message = hasSibling
    ? `Remove the ${label} version? Other versions of this stand alone video will stay.`
    : 'This is the only version. Remove the stand alone video from authoring and training?'
  if (!window.confirm(message)) return
  await removeCurrentVersion()
}

async function remove(): Promise<void> {
  if (!editable.value || !activities.current) return
  if (
    !window.confirm(
      'Remove this stand alone video from authoring and training? The record will be kept in the database.',
    )
  ) {
    return
  }
  await removeCurrentVersion()
}
</script>

<template>
  <div class="author-page">
    <div v-if="loading" class="author-page-inner">
      <p class="author-muted">Loading stand alone video…</p>
    </div>

    <div v-else-if="!introduction" class="author-page-inner author-stack-sm">
      <p class="author-error">{{ loadError ?? activities.error ?? 'Stand Alone Video not found' }}</p>
      <RouterLink to="/studio/stand-alone-video">Back to list</RouterLink>
    </div>

    <div v-else class="author-page-inner author-stack">
      <div class="author-header-row">
        <div class="author-header-left">
          <RouterLink to="/studio/stand-alone-video" class="author-back" aria-label="Back">
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
          <h1 class="author-header-title">{{ title.trim() || 'Stand Alone Video' }}</h1>
          <AuthorStatusChip :label="isPublished ? 'PUBLISHED' : 'DRAFT'" />
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px">
          <AuthorPillButton
            variant="ghost"
            :disabled="saving || publishing || deleting || creatingVersion"
            @click="openPreview"
          >
            Preview
          </AuthorPillButton>
          <AuthorPillButton
            v-if="editable"
            variant="primary"
            :disabled="saving || publishing || deleting || creatingVersion"
            @click="publish"
          >
            {{ publishing ? 'Publishing…' : 'Publish' }}
          </AuthorPillButton>
        </div>
      </div>

      <p v-if="!editable" class="author-readonly-banner">
        View only — you can open this stand alone video, but only the owner or an admin can edit it.
      </p>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Version" />
        <div class="mvp-version-row">
          <AuthorSelectField
            :id="`${activityId}-version`"
            :model-value="activityId"
            label="Version"
            :options="versionSelectOptions"
            :disabled="creatingVersion || deleting"
            @update:model-value="onVersionSelect"
          />
          <AuthorPillButton
            v-if="editable"
            variant="white"
            :disabled="saving || publishing || deleting || creatingVersion"
            @click="createVersion"
          >
            {{ creatingVersion ? 'Creating…' : 'New Version' }}
          </AuthorPillButton>
          <AuthorPillButton
            v-if="editable"
            variant="ghost"
            :disabled="saving || publishing || deleting || creatingVersion"
            @click="removeVersion"
          >
            {{ deleting ? 'Removing…' : 'Remove Version' }}
          </AuthorPillButton>
        </div>
      </section>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Details" />
        <AuthorField
          :id="`${activityId}-title`"
          v-model="title"
          label="Title"
          :error="titleError ?? undefined"
          placeholder="Stand Alone Video title"
          :disabled="!editable"
        />
        <AuthorField
          :id="`${activityId}-description`"
          v-model="description"
          label="Description"
          multiline
          :rows="2"
          placeholder="What this video covers"
          :disabled="!editable"
        />
        <AuthorField
          :id="`${activityId}-country`"
          v-model="country"
          label="Country"
          placeholder="Select country"
          :options="selectOptions(LESSON_COUNTRY_OPTIONS, country)"
          :disabled="!editable"
        />
        <AuthorField
          :id="`${activityId}-language`"
          v-model="language"
          label="Language"
          placeholder="Select language"
          :options="selectOptions(LESSON_LANGUAGE_OPTIONS, language)"
          :disabled="!editable"
        />
      </section>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Video" />
        <p class="author-muted">
          Plays on its own, or before Observe, Process, and Anticipate when attached to a lesson.
        </p>
        <MediaUploadField
          :id="`${activityId}-intro-video`"
          :key="introduction.introMedia?.media_asset_id ?? 'intro-empty'"
          :activity-id="activityId"
          label="Video"
          :model-value="introduction.introMedia"
          :readonly="!editable"
          @update:model-value="setIntroMedia"
        />
        <AuthorToggle
          :id="`${activityId}-intro-first-visit`"
          :model-value="introduction.introShowOnFirstVisitOnly !== false"
          label="Show on first visit only"
          description="When on, the intro plays once per learner. When off, it plays every time the lesson starts."
          @update:model-value="setIntroFirstVisit"
        />
      </section>

      <div v-if="editable" class="author-actions">
        <AuthorPillButton
          variant="primary"
          :disabled="saving || publishing || deleting || creatingVersion"
          @click="saveIntro"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </AuthorPillButton>
        <AuthorPillButton
          variant="ghost"
          :disabled="saving || publishing || deleting || creatingVersion"
          @click="remove"
        >
          {{ deleting ? 'Removing…' : 'Remove' }}
        </AuthorPillButton>
        <p v-if="saveMessage" class="author-success">{{ saveMessage }}</p>
      </div>
    </div>
  </div>
</template>
