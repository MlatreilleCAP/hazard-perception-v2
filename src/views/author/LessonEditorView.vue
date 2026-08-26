<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  readLessonDefinition,
  writeLessonDefinition,
} from '@/activities/lessonDefinition'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import { useActivityStore } from '@/stores/activityStore'
import type { ActivitySummary } from '@/types/activity'
import {
  LESSON_COMPOSER_SECTIONS,
  createLessonCompositionItem,
  isLessonActivity,
  orderedInroadsCompositionItems,
  sanitizeLessonCompositionForSave,
  validateLessonCompositionForPublish,
  type LessonComposition,
  type LessonCompositionItemKind,
  type LessonDefinition,
} from '@/types/lesson'
import { isAnticipateActivity } from '@/types/anticipate'
import type { MediaRef } from '@/types/media'
import { isProcessActivity } from '@/types/process'
import { isSeeActivity } from '@/types/see'

type SectionPick = {
  search: string
  selectedRefId: string
}

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
const lesson = ref<LessonDefinition | null>(null)
const sectionPicks = ref<Record<LessonCompositionItemKind, SectionPick>>({
  see: { search: '', selectedRefId: '' },
  process: { search: '', selectedRefId: '' },
  anticipate: { search: '', selectedRefId: '' },
})

const activityId = computed(() => String(route.params.id ?? ''))
const isPublished = computed(
  () =>
    activities.summaries.find((item) => item.id === activityId.value)?.published ??
    false,
)

const seeCatalog = computed(() =>
  activities.summaries.filter((item) => isSeeActivity(item.tags)),
)
const processCatalog = computed(() =>
  activities.summaries.filter((item) => isProcessActivity(item.tags)),
)
const anticipateCatalog = computed(() =>
  activities.summaries.filter((item) => isAnticipateActivity(item.tags)),
)

function catalogForKind(kind: LessonCompositionItemKind): ActivitySummary[] {
  if (kind === 'see') return seeCatalog.value
  if (kind === 'process') return processCatalog.value
  if (kind === 'anticipate') return anticipateCatalog.value
  return []
}

function filteredCatalog(kind: LessonCompositionItemKind): ActivitySummary[] {
  const q = sectionPicks.value[kind].search.trim().toLowerCase()
  const base = catalogForKind(kind)
  if (!q) return base
  return base.filter((item) => item.title.toLowerCase().includes(q))
}

function findSectionItem(
  composition: LessonComposition,
  kind: LessonCompositionItemKind,
) {
  return composition.items.find((item) => item.kind === kind)
}

function syncPicksFromComposition(composition: LessonComposition): void {
  sectionPicks.value = {
    see: {
      search: '',
      selectedRefId: findSectionItem(composition, 'see')?.refId ?? '',
    },
    process: {
      search: '',
      selectedRefId: findSectionItem(composition, 'process')?.refId ?? '',
    },
    anticipate: {
      search: '',
      selectedRefId: findSectionItem(composition, 'anticipate')?.refId ?? '',
    },
  }
}

function rebuildComposition(): void {
  if (!lesson.value) return
  const items = LESSON_COMPOSER_SECTIONS.flatMap((section) => {
    const refId = sectionPicks.value[section.kind].selectedRefId.trim()
    if (!refId) return []
    const existing = lesson.value?.composition.items.find(
      (item) => item.kind === section.kind && item.refId === refId,
    )
    if (existing) return [existing]
    const option = catalogForKind(section.kind).find((item) => item.id === refId)
    return [
      createLessonCompositionItem(section.kind, refId, option?.title ?? 'Untitled'),
    ]
  })
  lesson.value = {
    version: 1,
    introMedia: lesson.value.introMedia,
    composition: sanitizeLessonCompositionForSave({
      schemaVersion: 1,
      items,
    }),
  }
}

function setIntroMedia(media: MediaRef | null): void {
  if (!lesson.value) return
  lesson.value = { ...lesson.value, introMedia: media }
  saveMessage.value = null
}

function selectSectionItem(kind: LessonCompositionItemKind, refId: string): void {
  sectionPicks.value = {
    ...sectionPicks.value,
    [kind]: { ...sectionPicks.value[kind], selectedRefId: refId },
  }
  rebuildComposition()
  saveMessage.value = null
}

function editHrefForKind(kind: LessonCompositionItemKind, refId: string): string | null {
  if (!refId) return null
  if (kind === 'see') return `/studio/see/${refId}`
  if (kind === 'process') return `/studio/process/${refId}`
  if (kind === 'anticipate') return `/studio/anticipate/${refId}`
  return null
}

function selectedOption(
  kind: LessonCompositionItemKind,
): ActivitySummary | null {
  const refId = sectionPicks.value[kind].selectedRefId
  if (!refId) return null
  return (
    catalogForKind(kind).find((item) => item.id === refId) ??
    ({
      id: refId,
      title:
        findSectionItem(lesson.value?.composition ?? { schemaVersion: 1, items: [] }, kind)
          ?.title ?? 'Missing item',
      version: 0,
      published: false,
      tags: [],
      updatedAt: '',
    } as ActivitySummary)
  )
}

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
    if (!current || !isLessonActivity(current.metadata.tags)) {
      lesson.value = null
      return
    }
    title.value = current.metadata.title
    description.value = current.metadata.description
    const parsed = readLessonDefinition(current)
    lesson.value = parsed
    syncPicksFromComposition(parsed.composition)
  } catch (cause) {
    if (generation !== loadGeneration) return
    lesson.value = null
    loadError.value = cause instanceof Error ? cause.message : 'Failed to load lesson'
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

async function persist(): Promise<boolean> {
  titleError.value = title.value.trim() ? null : 'Title is required'
  if (titleError.value || !lesson.value || !activities.current) return false

  saving.value = true
  saveMessage.value = null
  try {
    rebuildComposition()
    const next = writeLessonDefinition(activities.current, {
      version: 1,
      introMedia: lesson.value.introMedia,
      composition: sanitizeLessonCompositionForSave(lesson.value.composition),
    })
    next.metadata = {
      ...next.metadata,
      title: title.value.trim(),
      description: description.value.trim(),
    }
    await activities.save(next)
    activities.stagePreview(next)
    saveMessage.value = 'Lesson saved.'
    return true
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to save lesson')
    return false
  } finally {
    saving.value = false
  }
}

async function preview(): Promise<void> {
  const saved = await persist()
  if (!saved) return
  await router.push(`/player?activity=${activityId.value}&preview=1`)
}

async function publish(): Promise<void> {
  if (!lesson.value) return
  rebuildComposition()
  const issues = validateLessonCompositionForPublish(lesson.value.composition)
  const missing = orderedInroadsCompositionItems(lesson.value.composition).filter(
    (item) => !catalogForKind(item.kind).some((entry) => entry.id === item.refId),
  )
  if (missing.length > 0) {
    issues.push(
      `${missing.map((item) => item.title).join(', ')} could not be found. Replace missing selections.`,
    )
  }
  if (issues.length > 0) {
    window.alert(issues.join('\n'))
    return
  }
  const saved = await persist()
  if (!saved) return
  publishing.value = true
  try {
    await activities.publish(activityId.value)
    saveMessage.value = 'Lesson published.'
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to publish lesson')
  } finally {
    publishing.value = false
  }
}

async function remove(): Promise<void> {
  if (!window.confirm('Remove this lesson from authoring and training?')) return
  deleting.value = true
  try {
    await activities.remove(activityId.value)
    await router.push('/studio/lesson')
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove lesson')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack">
      <div class="author-header-row">
        <div class="author-header-left">
          <RouterLink to="/studio/lesson" class="author-back" aria-label="Back">
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
          <h1 class="author-header-title">Lesson composer</h1>
          <AuthorStatusChip :label="isPublished ? 'PUBLISHED' : 'DRAFT'" />
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px">
          <AuthorPillButton
            variant="ghost"
            :disabled="loading || saving || !lesson"
            @click="preview"
          >
            Preview
          </AuthorPillButton>
          <AuthorPillButton
            variant="primary"
            :disabled="loading || saving || publishing || !lesson"
            @click="publish"
          >
            {{ publishing ? 'Publishing…' : 'Publish' }}
          </AuthorPillButton>
        </div>
      </div>

      <p v-if="loading" class="author-muted">Loading lesson…</p>
      <p v-else-if="loadError" class="author-error">{{ loadError }}</p>
      <p v-else-if="!lesson" class="author-error">Lesson not found.</p>

      <template v-else>
        <p class="author-muted">
          Choose Observe, Process, and Anticipate content for this lesson.
        </p>

        <section class="author-stack-sm">
          <AuthorSectionHeader title="Details" />
          <AuthorField
            :id="`${activityId}-title`"
            v-model="title"
            label="Title"
            :error="titleError ?? undefined"
            placeholder="Lesson title"
          />
          <AuthorField
            :id="`${activityId}-description`"
            v-model="description"
            label="Description"
            multiline
            :rows="3"
            placeholder="What learners will cover"
          />
        </section>

        <section class="author-stack-sm">
          <AuthorSectionHeader title="Intro video" />
          <p class="author-muted">
            Optional. Plays once on the learner’s first visit, before Observe / Process /
            Anticipate.
          </p>
          <MediaUploadField
            :id="`${activityId}-intro-video`"
            :activity-id="activityId"
            label="Intro video"
            :model-value="lesson.introMedia"
            @update:model-value="setIntroMedia"
          />
        </section>

        <section class="author-stack-sm">
          <AuthorSectionHeader title="Content" />
          <p class="author-muted">
            Select an item in each category to include it in the lesson.
          </p>

          <div
            v-for="section in LESSON_COMPOSER_SECTIONS"
            :key="section.kind"
            class="lesson-composer-section"
          >
            <div class="lesson-composer-section-head">
              <h2>{{ section.label }}</h2>
              <RouterLink
                v-if="
                  !('comingSoon' in section && section.comingSoon) &&
                  editHrefForKind(section.kind, sectionPicks[section.kind].selectedRefId)
                "
                :to="
                  editHrefForKind(section.kind, sectionPicks[section.kind].selectedRefId) ??
                  '#'
                "
                class="lesson-composer-edit-link"
              >
                Edit {{ section.label.toLowerCase() }}
              </RouterLink>
            </div>

            <p v-if="'comingSoon' in section && section.comingSoon" class="author-muted">
              Anticipate authoring is coming soon. This slot will unlock when Anticipate
              scenarios are available.
            </p>

            <template v-else>
              <div class="lesson-composer-fields">
                <AuthorField
                  :id="`${activityId}-${section.kind}-search`"
                  v-model="sectionPicks[section.kind].search"
                  label="Search"
                  :placeholder="`Filter ${section.label.toLowerCase()}…`"
                />
                <label class="author-field" :for="`${activityId}-${section.kind}-ref`">
                  <span style="min-width: 0; flex: 1">
                    <span class="author-field-label">Item</span>
                    <select
                      :id="`${activityId}-${section.kind}-ref`"
                      class="author-field-control"
                      :value="sectionPicks[section.kind].selectedRefId"
                      @change="
                        selectSectionItem(
                          section.kind,
                          ($event.target as HTMLSelectElement).value,
                        )
                      "
                    >
                      <option value="">Select {{ section.label.toLowerCase() }}</option>
                      <option
                        v-if="
                          selectedOption(section.kind) &&
                          !filteredCatalog(section.kind).some(
                            (item) => item.id === selectedOption(section.kind)?.id,
                          )
                        "
                        :value="selectedOption(section.kind)?.id"
                      >
                        {{ selectedOption(section.kind)?.title }} (unavailable)
                      </option>
                      <option
                        v-for="option in filteredCatalog(section.kind)"
                        :key="option.id"
                        :value="option.id"
                      >
                        {{ option.title }}
                        {{ option.published ? '' : ' · Draft' }}
                      </option>
                    </select>
                  </span>
                </label>
              </div>
              <p v-if="filteredCatalog(section.kind).length === 0" class="author-muted">
                No {{ section.label }} scenarios yet.
                <RouterLink
                  :to="section.kind === 'see' ? '/studio/see/new' : '/studio/process/new'"
                >
                  Create one
                </RouterLink>
              </p>
            </template>
          </div>
        </section>

        <div class="author-actions">
          <AuthorPillButton variant="primary" :disabled="saving" @click="persist">
            {{ saving ? 'Saving…' : 'Save' }}
          </AuthorPillButton>
          <AuthorPillButton variant="white" :disabled="deleting" @click="remove">
            {{ deleting ? 'Removing…' : 'Remove lesson' }}
          </AuthorPillButton>
          <p v-if="saveMessage" class="author-muted">{{ saveMessage }}</p>
        </div>
      </template>
    </div>
  </div>
</template>
