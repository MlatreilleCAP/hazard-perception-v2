<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  readInroadsMvpDefinition,
  writeInroadsMvpDefinition,
} from '@/activities/inroadsMvpDefinition'
import { readIntroductionDefinition } from '@/activities/introductionDefinition'
import AnticipateEditorView from '@/views/author/AnticipateEditorView.vue'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSelectField from '@/components/author/AuthorSelectField.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import InroadsMvpImportPanel from '@/components/author/InroadsMvpImportPanel.vue'
import ProcessEditorView from '@/views/author/ProcessEditorView.vue'
import SeeEditorView from '@/views/author/SeeEditorView.vue'
import { services } from '@/app/container'
import { duplicateInroadsMvpVersion } from '@/services/createInroadsMvp'
import { publishInroadsMvpLesson } from '@/services/publishInroadsMvp'
import { removeInroadsMvpParent } from '@/services/removeInroadsMvp'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { useActivityStore } from '@/stores/activityStore'
import {
  INROADS_MVP_SECTIONS,
  isInroadsMvpActivity,
  type InroadsMvpDefinition,
  type InroadsMvpSectionId,
} from '@/types/inroadsMvp'
import { isIntroductionActivity } from '@/types/introduction'
import {
  LESSON_COUNTRY_OPTIONS,
  LESSON_LANGUAGE_OPTIONS,
} from '@/lib/inroadsMvp/packageSpec'
import { lessonVersionKey, lessonVersionLabel, lessonLocalesMatch } from '@/lib/inroadsMvp/lessonVersions'

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
const mvp = ref<InroadsMvpDefinition | null>(null)

type LessonVersionOption = {
  id: string
  label: string
}

const versions = ref<LessonVersionOption[]>([])

type IntroductionVersionOption = {
  id: string
  label: string
  country: string
  language: string
}

const introductionVersions = ref<IntroductionVersionOption[]>([])

function sectionFromQuery(): InroadsMvpSectionId {
  const section = route.query.section
  if (section === 'see' || section === 'process' || section === 'anticipate') {
    return section
  }
  return 'lesson'
}

const activeSection = ref<InroadsMvpSectionId>(sectionFromQuery())
const sectionReload = ref(0)
const seeEditorRef = ref<{ save: () => Promise<boolean> } | null>(null)
const processEditorRef = ref<{ save: () => Promise<boolean> } | null>(null)
const anticipateEditorRef = ref<{ save: () => Promise<boolean> } | null>(null)
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

const introductionSelectOptions = computed(() => [
  { value: '', label: 'None' },
  ...introductionVersions.value.map((item) => ({
    value: item.id,
    label: item.label,
  })),
])

function selectOptions(options: readonly string[], current: string): string[] {
  if (!current.trim() || options.includes(current)) return [...options]
  return [current, ...options]
}

const country = computed({
  get: () => mvp.value?.country ?? '',
  set: (value: string) => {
    if (!mvp.value) return
    mvp.value = { ...mvp.value, country: value }
  },
})

const language = computed({
  get: () => mvp.value?.language ?? '',
  set: (value: string) => {
    if (!mvp.value) return
    mvp.value = { ...mvp.value, language: value }
  },
})

async function loadVersions(
  currentTitle: string,
  currentMvp: InroadsMvpDefinition,
): Promise<LessonVersionOption[]> {
  const key = lessonVersionKey(currentTitle)
  const siblings = activities.summaries.filter(
    (item) => isInroadsMvpActivity(item.tags) && lessonVersionKey(item.title) === key,
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
          label: lessonVersionLabel(currentMvp.country, currentMvp.language, item.published),
        }
      }
      try {
        const definition = await services.persistence.getById(item.id)
        const parsed = definition ? readInroadsMvpDefinition(definition) : null
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

async function loadIntroductionVersions(
  lessonTitle: string,
  selectedId: string,
): Promise<IntroductionVersionOption[]> {
  const key = lessonVersionKey(lessonTitle)
  const siblings = activities.summaries.filter(
    (item) => isIntroductionActivity(item.tags) && lessonVersionKey(item.title) === key,
  )
  if (selectedId && !siblings.some((item) => item.id === selectedId)) {
    const selected = activities.summaries.find((item) => item.id === selectedId)
    if (selected) siblings.unshift(selected)
  }
  const rows = await Promise.all(
    siblings.map(async (item) => {
      try {
        const definition = await services.persistence.getById(item.id)
        const parsed = definition ? readIntroductionDefinition(definition) : null
        return {
          id: item.id,
          country: parsed?.country ?? '',
          language: parsed?.language ?? '',
          label: lessonVersionLabel(
            parsed?.country ?? '',
            parsed?.language ?? '',
            item.published,
          ),
        }
      } catch {
        return {
          id: item.id,
          country: '',
          language: '',
          label: lessonVersionLabel('', '', item.published),
        }
      }
    }),
  )
  return rows.sort((a, b) => a.label.localeCompare(b.label))
}

function syncIntroductionToLocale(): void {
  if (!mvp.value?.introductionActivityId) return
  const match = introductionVersions.value.find((item) =>
    lessonLocalesMatch(item.country, item.language, country.value, language.value),
  )
  if (!match || mvp.value.introductionActivityId === match.id) return
  mvp.value = { ...mvp.value, introductionActivityId: match.id }
}

function mvpForSave(source: InroadsMvpDefinition): InroadsMvpDefinition {
  if (source.introductionActivityId) return source
  return { ...source, introductionActivityId: '', introMedia: null }
}

function onVersionSelect(nextId: string): void {
  if (!nextId || nextId === activityId.value) return
  void router.push({
    path: `/studio/inroads-mvp/${nextId}`,
    query: route.query,
  })
}

async function createVersion(): Promise<void> {
  if (!editable.value || !mvp.value || creatingVersion.value) return
  const saved = await saveLesson()
  if (!saved) return
  creatingVersion.value = true
  try {
    const nextId = await duplicateInroadsMvpVersion(activityId.value)
    await activities.refreshList()
    await router.push({
      path: `/studio/inroads-mvp/${nextId}`,
      query: route.query,
    })
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to create version')
  } finally {
    creatingVersion.value = false
  }
}

async function ensureParentLoaded(): Promise<boolean> {
  if (activities.current?.id === activityId.value) return true
  await activities.load(activityId.value)
  return activities.current?.id === activityId.value
}

async function load(options?: { keepVisible?: boolean }): Promise<void> {
  const generation = ++loadGeneration
  if (!options?.keepVisible) loading.value = true
  loadError.value = null
  try {
    await activities.refreshList()
    await activities.load(activityId.value)
    if (generation !== loadGeneration) return
    const current = activities.current
    const parsed = current ? readInroadsMvpDefinition(current) : null
    if (!current || !parsed) {
      mvp.value = null
      loadError.value = 'Inroads MVP not found'
      return
    }
    title.value = current.metadata.title
    description.value = current.metadata.description
    mvp.value = parsed
    const nextVersions = await loadVersions(current.metadata.title, parsed)
    const nextIntroductionVersions = await loadIntroductionVersions(
      current.metadata.title,
      parsed.introductionActivityId,
    )
    if (generation !== loadGeneration) return
    versions.value = nextVersions
    introductionVersions.value = nextIntroductionVersions
    syncIntroductionToLocale()
  } catch (cause) {
    if (generation !== loadGeneration) return
    mvp.value = null
    loadError.value = cause instanceof Error ? cause.message : 'Failed to load Inroads MVP'
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

watch(
  () => route.query.section,
  (section) => {
    if (section === 'intro' && activityId.value) {
      void router.replace(`/studio/stand-alone-video/${activityId.value}`)
      return
    }
    activeSection.value = sectionFromQuery()
  },
  { immediate: true },
)

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
  syncIntroductionToLocale()
})

watch(activeSection, async (section) => {
  if (section === 'lesson') {
    await ensureParentLoaded()
  }
})

function setIntroductionActivityId(id: string): void {
  if (!mvp.value) return
  mvp.value = {
    ...mvp.value,
    introductionActivityId: id,
    introMedia: id ? mvp.value.introMedia : null,
  }
}

async function onImported(): Promise<void> {
  sectionReload.value += 1
  await load({ keepVisible: true })
}

async function saveLesson(): Promise<boolean> {
  if (!editable.value || !mvp.value) return false
  titleError.value = title.value.trim() ? null : 'Title is required'
  if (titleError.value) return false

  saving.value = true
  saveMessage.value = null
  try {
    await ensureParentLoaded()
    if (!activities.current || !mvp.value) return false
    const next = writeInroadsMvpDefinition(activities.current, mvpForSave(mvp.value))
    next.metadata = {
      ...next.metadata,
      title: title.value.trim(),
      description: description.value.trim(),
    }
    await activities.save(next)
    versions.value = await loadVersions(next.metadata.title, mvp.value)
    introductionVersions.value = await loadIntroductionVersions(
      next.metadata.title,
      mvp.value.introductionActivityId,
    )
    syncIntroductionToLocale()
    saveMessage.value = 'Saved'
    window.setTimeout(() => {
      saveMessage.value = null
    }, 2000)
    return true
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to save Inroads MVP')
    return false
  } finally {
    saving.value = false
  }
}

async function openPreview(): Promise<void> {
  if (!activityId.value) return
  if (editable.value && activeSection.value === 'lesson') {
    const saved = await saveLesson()
    if (!saved) return
  }
  await ensureParentLoaded()
  if (activities.current) {
    activities.stagePreview(activities.current)
  }
  await router.push({
    path: '/player',
    query: {
      activity: activityId.value,
      preview: '1',
      mvp: '1',
      section: activeSection.value,
    },
  })
}

async function saveActiveSection(): Promise<boolean> {
  if (activeSection.value === 'see') {
    return (await seeEditorRef.value?.save()) ?? true
  }
  if (activeSection.value === 'process') {
    return (await processEditorRef.value?.save()) ?? true
  }
  if (activeSection.value === 'anticipate') {
    return (await anticipateEditorRef.value?.save()) ?? true
  }
  return saveLesson()
}

async function publish(): Promise<void> {
  if (!editable.value || !mvp.value) return
  if (!(await saveActiveSection())) return
  if (activeSection.value !== 'lesson' && !(await saveLesson())) return
  if (!(await ensureParentLoaded())) return
  publishing.value = true
  try {
    await publishInroadsMvpLesson(activityId.value)
    await activities.refreshList()
    await ensureParentLoaded()
    saveMessage.value = 'Published'
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to publish Inroads MVP')
  } finally {
    publishing.value = false
  }
}

async function removeCurrentVersion(): Promise<void> {
  if (!editable.value || !mvp.value) return
  const siblingId = versions.value.find((item) => item.id !== activityId.value)?.id ?? ''
  deleting.value = true
  try {
    await removeInroadsMvpParent(activityId.value)
    await activities.refreshList()
    await router.push(
      siblingId
        ? { path: `/studio/inroads-mvp/${siblingId}`, query: route.query }
        : '/studio/inroads-mvp',
    )
  } catch (cause) {
    deleting.value = false
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove version')
  }
}

async function removeVersion(): Promise<void> {
  if (!editable.value || !mvp.value || deleting.value) return
  const label = lessonVersionLabel(country.value, language.value, isPublished.value)
  const hasSibling = versions.value.some((item) => item.id !== activityId.value)
  const message = hasSibling
    ? `Remove the ${label} version? Other versions of this lesson will stay.`
    : 'This is the only version. Remove the lesson from authoring and training?'
  if (!window.confirm(message)) return
  await removeCurrentVersion()
}

async function remove(): Promise<void> {
  if (!editable.value || !mvp.value) return
  const count = versions.value.length
  const message =
    count > 1
      ? `Remove this lesson and all ${count} versions from authoring and training?`
      : 'Remove this Inroads MVP lesson from authoring and training?'
  if (!window.confirm(message)) return
  deleting.value = true
  try {
    for (const version of versions.value) {
      await removeInroadsMvpParent(version.id)
    }
    await activities.refreshList()
    await router.push('/studio/inroads-mvp')
  } catch (cause) {
    deleting.value = false
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove lesson')
  }
}
</script>

<template>
  <div class="author-page">
    <div v-if="loading" class="author-page-inner">
      <p class="author-muted">Loading Inroads MVP…</p>
    </div>

    <div v-else-if="!mvp" class="author-page-inner author-stack-sm">
      <p class="author-error">{{ loadError ?? activities.error ?? 'Inroads MVP not found' }}</p>
      <RouterLink to="/studio/inroads-mvp">Back to list</RouterLink>
    </div>

    <div v-else class="author-page-inner author-stack">
      <div class="author-header-row">
        <div class="author-header-left">
          <RouterLink to="/studio/inroads-mvp" class="author-back" aria-label="Back">
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
          <h1 class="author-header-title">{{ title.trim() || 'Inroads MVP' }}</h1>
          <AuthorStatusChip :label="isPublished ? 'PUBLISHED' : 'DRAFT'" />
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px">
          <AuthorPillButton
            variant="ghost"
            :disabled="saving || publishing || deleting"
            @click="openPreview"
          >
            Preview
          </AuthorPillButton>
          <AuthorPillButton
            v-if="editable"
            variant="primary"
            :disabled="saving || publishing || deleting"
            @click="publish"
          >
            {{ publishing ? 'Publishing…' : 'Publish lesson' }}
          </AuthorPillButton>
        </div>
      </div>

      <p v-if="!editable" class="author-readonly-banner">
        View only — you can open this lesson, but only the owner or an admin can edit it.
      </p>

      <nav class="mvp-section-nav" aria-label="Inroads MVP sections">
        <button
          v-for="section in INROADS_MVP_SECTIONS"
          :key="section.id"
          type="button"
          class="mvp-section-tab"
          :class="{ active: activeSection === section.id }"
          @click="activeSection = section.id"
        >
          {{ section.label }}
        </button>
      </nav>

      <template v-if="activeSection === 'lesson'">
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

        <section v-if="editable" class="author-stack-sm">
          <AuthorSectionHeader title="Bulk import" />
          <InroadsMvpImportPanel
            :parent-id="activityId"
            :disabled="saving || publishing || deleting"
            @imported="onImported"
          />
        </section>

        <section class="author-stack-sm">
          <AuthorSectionHeader title="Details" />
          <AuthorField
            :id="`${activityId}-title`"
            v-model="title"
            label="Title"
            :error="titleError ?? undefined"
            placeholder="Inroads MVP title"
            :disabled="!editable"
          />
          <AuthorField
            :id="`${activityId}-description`"
            v-model="description"
            label="Description"
            multiline
            :rows="2"
            placeholder="What learners will cover"
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
          <AuthorSectionHeader title="Stand Alone Video" />
          <AuthorSelectField
            v-if="mvp"
            :id="`${activityId}-introduction`"
            :model-value="mvp.introductionActivityId"
            label="Version"
            :options="introductionSelectOptions"
            :disabled="!editable"
            @update:model-value="setIntroductionActivityId"
          />
          <p v-if="mvp && !introductionVersions.length" class="author-muted">
            No stand alone video versions match this lesson title yet.
          </p>
        </section>

        <div v-if="editable" class="author-actions">
          <AuthorPillButton variant="primary" :disabled="saving || deleting" @click="saveLesson">
            {{ saving ? 'Saving…' : 'Save' }}
          </AuthorPillButton>
          <AuthorPillButton variant="ghost" :disabled="saving || deleting" @click="remove">
            {{ deleting ? 'Removing…' : 'Remove lesson' }}
          </AuthorPillButton>
          <p v-if="saveMessage" class="author-success">{{ saveMessage }}</p>
        </div>
      </template>

      <div v-else-if="activeSection === 'see'" class="mvp-embedded-editor">
        <SeeEditorView
          ref="seeEditorRef"
          :key="`see-${mvp.seeActivityId}-${sectionReload}`"
          :activity-id-prop="mvp.seeActivityId"
          embedded
        />
      </div>
      <div v-else-if="activeSection === 'process'" class="mvp-embedded-editor">
        <ProcessEditorView
          ref="processEditorRef"
          :key="`process-${mvp.processActivityId}-${sectionReload}`"
          :activity-id-prop="mvp.processActivityId"
          embedded
        />
      </div>
      <div v-else-if="activeSection === 'anticipate'" class="mvp-embedded-editor">
        <AnticipateEditorView
          ref="anticipateEditorRef"
          :key="`anticipate-${mvp.anticipateActivityId}-${sectionReload}`"
          :activity-id-prop="mvp.anticipateActivityId"
          embedded
        />
      </div>
    </div>
  </div>
</template>
