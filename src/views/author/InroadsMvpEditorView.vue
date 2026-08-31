<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  readInroadsMvpDefinition,
  writeInroadsMvpDefinition,
} from '@/activities/inroadsMvpDefinition'
import AnticipateEditorView from '@/views/author/AnticipateEditorView.vue'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import AuthorToggle from '@/components/author/AuthorToggle.vue'
import InroadsMvpImportPanel from '@/components/author/InroadsMvpImportPanel.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import ProcessEditorView from '@/views/author/ProcessEditorView.vue'
import SeeEditorView from '@/views/author/SeeEditorView.vue'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { useActivityStore } from '@/stores/activityStore'
import {
  INROADS_MVP_SECTIONS,
  type InroadsMvpDefinition,
  type InroadsMvpSectionId,
} from '@/types/inroadsMvp'
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
const saveMessage = ref<string | null>(null)
const title = ref('')
const description = ref('')
const titleError = ref<string | null>(null)
const mvp = ref<InroadsMvpDefinition | null>(null)

function sectionFromQuery(): InroadsMvpSectionId {
  const section = route.query.section
  if (
    section === 'intro' ||
    section === 'see' ||
    section === 'process' ||
    section === 'anticipate'
  ) {
    return section
  }
  return 'intro'
}

const activeSection = ref<InroadsMvpSectionId>(sectionFromQuery())
const sectionReload = ref(0)
let loadGeneration = 0

const activityId = computed(() => String(route.params.id ?? ''))
const isPublished = computed(
  () => activities.summaries.find((item) => item.id === activityId.value)?.published ?? false,
)
const editable = computed(() => canEdit(activities.current?.metadata.authorId))

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
  () => {
    activeSection.value = sectionFromQuery()
  },
)

watch(activeSection, async (section) => {
  if (section === 'intro') {
    await ensureParentLoaded()
  }
})

async function onImported(): Promise<void> {
  sectionReload.value += 1
  await load({ keepVisible: true })
}

function setIntroMedia(media: MediaRef | null): void {
  if (!mvp.value) return
  mvp.value = { ...mvp.value, introMedia: media }
}

function setIntroFirstVisit(value: boolean): void {
  if (!mvp.value) return
  mvp.value = { ...mvp.value, introShowOnFirstVisitOnly: value }
}

async function saveIntro(): Promise<boolean> {
  if (!editable.value || !mvp.value) return false
  titleError.value = title.value.trim() ? null : 'Title is required'
  if (titleError.value) return false

  saving.value = true
  saveMessage.value = null
  try {
    await ensureParentLoaded()
    if (!activities.current || !mvp.value) return false
    const next = writeInroadsMvpDefinition(activities.current, mvp.value)
    next.metadata = {
      ...next.metadata,
      title: title.value.trim(),
      description: description.value.trim(),
    }
    await activities.save(next)
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
  if (editable.value && activeSection.value === 'intro') {
    const saved = await saveIntro()
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

async function publish(): Promise<void> {
  if (!editable.value || !mvp.value) return
  const saved = await saveIntro()
  if (!saved) return
  publishing.value = true
  try {
    // Publish section activities first, then the parent.
    await activities.publish(mvp.value.seeActivityId)
    await activities.publish(mvp.value.processActivityId)
    await activities.publish(mvp.value.anticipateActivityId)
    await ensureParentLoaded()
    await activities.publish(activityId.value)
    saveMessage.value = 'Published'
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to publish Inroads MVP')
  } finally {
    publishing.value = false
  }
}

async function remove(): Promise<void> {
  if (!editable.value || !mvp.value) return
  if (!window.confirm('Remove this Inroads MVP lesson from authoring and training?')) return
  deleting.value = true
  try {
    const childIds = [
      mvp.value.seeActivityId,
      mvp.value.processActivityId,
      mvp.value.anticipateActivityId,
    ]
    await activities.remove(activityId.value)
    for (const childId of childIds) {
      try {
        await activities.remove(childId)
      } catch {
        // Parent removal succeeded; orphaned children can be cleaned up later.
      }
    }
    await router.push('/studio/inroads-mvp')
  } catch (cause) {
    deleting.value = false
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove Inroads MVP')
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
          <h1 class="author-header-title">Inroads MVP</h1>
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
            {{ publishing ? 'Publishing…' : 'Publish' }}
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

      <template v-if="activeSection === 'intro'">
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
          <AuthorSectionHeader title="Section 1 · Intro video" />
          <p class="author-muted">
            Plays before Observe, Process, and Anticipate when configured.
          </p>
          <MediaUploadField
            :id="`${activityId}-intro-video`"
            :key="mvp.introMedia?.media_asset_id ?? 'intro-empty'"
            :activity-id="activityId"
            label="Intro video"
            :model-value="mvp.introMedia"
            :readonly="!editable"
            @update:model-value="setIntroMedia"
          />
          <AuthorToggle
            :id="`${activityId}-intro-first-visit`"
            :model-value="mvp.introShowOnFirstVisitOnly !== false"
            label="Show on first visit only"
            description="When on, the intro plays once per learner. When off, it plays every time the lesson starts."
            @update:model-value="setIntroFirstVisit"
          />
        </section>

        <div v-if="editable" class="author-actions">
          <AuthorPillButton variant="primary" :disabled="saving || deleting" @click="saveIntro">
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
          :key="`see-${mvp.seeActivityId}-${sectionReload}`"
          :activity-id-prop="mvp.seeActivityId"
          embedded
        />
      </div>
      <div v-else-if="activeSection === 'process'" class="mvp-embedded-editor">
        <ProcessEditorView
          :key="`process-${mvp.processActivityId}-${sectionReload}`"
          :activity-id-prop="mvp.processActivityId"
          embedded
        />
      </div>
      <div v-else-if="activeSection === 'anticipate'" class="mvp-embedded-editor">
        <AnticipateEditorView
          :key="`anticipate-${mvp.anticipateActivityId}-${sectionReload}`"
          :activity-id-prop="mvp.anticipateActivityId"
          embedded
        />
      </div>
    </div>
  </div>
</template>
