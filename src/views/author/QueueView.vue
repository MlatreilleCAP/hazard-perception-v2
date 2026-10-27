<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import { services } from '@/app/container'
import { useStudioAccess } from '@/composables/useStudioAccess'
import {
  publishInroadsMvpLesson,
  setLessonReviewNotes,
  setLessonReviewStatus,
} from '@/services/publishInroadsMvp'
import { useActivityStore } from '@/stores/activityStore'
import {
  isInroadsMvpActivity,
  lessonQueueStatus,
  lessonQueueStatusLabel,
  type LessonReviewStatus,
} from '@/types/inroadsMvp'

const activities = useActivityStore()
const { isAdmin } = useStudioAccess()

type QueueRow = {
  id: string
  title: string
  country: string
  language: string
  status: LessonReviewStatus
  reviewNotes: string
  savedNotes: string
}

type ReviewAction = LessonReviewStatus

const QUEUE_TABS: { status: LessonReviewStatus; label: string }[] = [
  { status: 'draft', label: 'Draft' },
  { status: 'ready_for_media', label: 'Ready for media' },
  { status: 'ready_for_review', label: 'Ready for approval' },
  { status: 'changes_requested', label: 'Changes requested' },
  { status: 'approved', label: 'Approved' },
  { status: 'published', label: 'Published' },
]

const rows = ref<QueueRow[]>([])
const loading = ref(true)
const activeStatus = ref<LessonReviewStatus>('draft')
const menuOpenId = ref<string | null>(null)
const updatingId = ref<string | null>(null)
const savingNotesId = ref<string | null>(null)
const actionError = ref<string | null>(null)

const visibleRows = computed(() => rows.value.filter((row) => row.status === activeStatus.value))

const activeTabLabel = computed(
  () => QUEUE_TABS.find((tab) => tab.status === activeStatus.value)?.label ?? 'Draft',
)

function localeLabel(row: QueueRow): string {
  return [row.country, row.language].filter(Boolean).join(' · ') || 'Language not set'
}

function countFor(status: LessonReviewStatus): number {
  return rows.value.filter((row) => row.status === status).length
}

function selectTab(status: LessonReviewStatus): void {
  activeStatus.value = status
  menuOpenId.value = null
}

function onPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Node)) return
  const open = document.querySelector('.queue-status-menu.is-open')
  if (open?.contains(event.target)) return
  menuOpenId.value = null
}

onMounted(async () => {
  document.addEventListener('pointerdown', onPointerDown)
  loading.value = true
  await activities.refreshList()
  const lessons = activities.summaries.filter((item) => isInroadsMvpActivity(item.tags))
  const loaded = await Promise.all(
    lessons.map(async (item): Promise<QueueRow> => {
      try {
        const definition = await services.persistence.getById(item.id)
        const mvp = definition ? readInroadsMvpDefinition(definition) : null
        const reviewNotes = mvp?.reviewNotes ?? ''
        return {
          id: item.id,
          title: definition?.metadata.title.trim() || item.title,
          country: mvp?.country.trim() ?? '',
          language: mvp?.language.trim() ?? '',
          status: lessonQueueStatus(mvp?.reviewStatus, item.published),
          reviewNotes,
          savedNotes: reviewNotes,
        }
      } catch {
        return {
          id: item.id,
          title: item.title,
          country: '',
          language: '',
          status: lessonQueueStatus('draft', item.published),
          reviewNotes: '',
          savedNotes: '',
        }
      }
    }),
  )
  rows.value = loaded.sort((left, right) => {
    const byTitle = left.title.localeCompare(right.title)
    if (byTitle !== 0) return byTitle
    return localeLabel(left).localeCompare(localeLabel(right))
  })
  loading.value = false
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown)
})

function toggleMenu(id: string): void {
  menuOpenId.value = menuOpenId.value === id ? null : id
}

async function updateStatus(row: QueueRow, status: ReviewAction): Promise<void> {
  if (!isAdmin.value || updatingId.value || row.status === status) return
  menuOpenId.value = null
  updatingId.value = row.id
  actionError.value = null
  try {
    if (status === 'published') {
      await publishInroadsMvpLesson(row.id)
      await setLessonReviewStatus(row.id, 'published')
      await activities.refreshList()
    } else {
      await setLessonReviewStatus(row.id, status)
    }
    rows.value = rows.value.map((item) => (item.id === row.id ? { ...item, status } : item))
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Failed to update status'
  } finally {
    updatingId.value = null
  }
}

function onNotesChange(row: QueueRow, event: Event): void {
  const field = event.target
  if (!(field instanceof HTMLTextAreaElement)) return
  row.reviewNotes = field.value
  void saveNotes(row)
}

async function saveNotes(row: QueueRow): Promise<void> {
  if (!isAdmin.value || savingNotesId.value === row.id) return
  const notes = row.reviewNotes.trim()
  if (notes === row.savedNotes) return
  savingNotesId.value = row.id
  actionError.value = null
  try {
    await setLessonReviewNotes(row.id, notes)
    row.reviewNotes = notes
    row.savedNotes = notes
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Failed to save notes'
  } finally {
    savingNotesId.value = null
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>Queue</h1>
          <p>Every lesson and language version, with its status</p>
        </div>
      </div>

      <p v-if="activities.error" class="author-error">{{ activities.error }}</p>
      <p v-if="actionError" class="author-error">{{ actionError }}</p>

      <nav class="mvp-section-nav" aria-label="Queue status">
        <button
          v-for="tab in QUEUE_TABS"
          :key="tab.status"
          type="button"
          class="mvp-section-tab"
          :class="{ active: activeStatus === tab.status }"
          :aria-pressed="activeStatus === tab.status"
          @click="selectTab(tab.status)"
        >
          {{ tab.label }}{{ loading ? '' : ` (${countFor(tab.status)})` }}
        </button>
      </nav>

      <section class="author-list-card">
        <div class="author-list-card-head">
          <h2>{{ activeTabLabel }}</h2>
          <span class="author-count">{{ visibleRows.length }}</span>
        </div>

        <div v-if="loading" class="author-list-empty">
          <p class="author-muted">Loading lessons…</p>
        </div>

        <div v-else-if="rows.length === 0" class="author-list-empty">
          <p class="author-muted">No lessons yet.</p>
        </div>

        <div v-else-if="visibleRows.length === 0" class="author-list-empty">
          <p class="author-muted">No lessons in {{ activeTabLabel }}.</p>
        </div>

        <ul v-else class="author-list">
          <li
            v-for="row in visibleRows"
            :key="row.id"
            class="author-list-row"
            :class="{ 'has-notes': row.status === 'changes_requested' }"
          >
            <div class="queue-row-main">
            <div style="min-width: 0; flex: 1">
              <RouterLink :to="`/studio/inroads-mvp/${row.id}`" class="author-list-title">
                {{ row.title }}
              </RouterLink>
              <p class="author-list-sub">{{ localeLabel(row) }}</p>
            </div>
            <AuthorStatusChip :label="lessonQueueStatusLabel(row.status)" />
            <RouterLink
              class="author-pill author-pill-white"
              :to="{
                path: '/player',
                query: { activity: row.id, preview: '1', mvp: '1', section: 'lesson' },
              }"
            >
              Preview lesson
            </RouterLink>
            <div
              v-if="isAdmin"
              class="author-menu queue-status-menu"
              :class="{ 'is-open': menuOpenId === row.id }"
            >
              <button
                type="button"
                class="author-menu-btn"
                aria-label="Change status"
                :aria-expanded="menuOpenId === row.id"
                :disabled="updatingId === row.id"
                @click="toggleMenu(row.id)"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                  <circle cx="8" cy="3.5" r="1.25" />
                  <circle cx="8" cy="8" r="1.25" />
                  <circle cx="8" cy="12.5" r="1.25" />
                </svg>
              </button>
              <div v-if="menuOpenId === row.id" class="author-menu-panel" role="menu">
                <button
                  type="button"
                  class="author-menu-item"
                  role="menuitem"
                  :disabled="row.status === 'draft'"
                  @click="updateStatus(row, 'draft')"
                >
                  Draft
                </button>
                <button
                  type="button"
                  class="author-menu-item"
                  role="menuitem"
                  :disabled="row.status === 'changes_requested'"
                  @click="updateStatus(row, 'changes_requested')"
                >
                  Request changes
                </button>
                <button
                  type="button"
                  class="author-menu-item"
                  role="menuitem"
                  :disabled="row.status === 'approved'"
                  @click="updateStatus(row, 'approved')"
                >
                  Approve
                </button>
                <button
                  type="button"
                  class="author-menu-item"
                  role="menuitem"
                  :disabled="row.status === 'published'"
                  @click="updateStatus(row, 'published')"
                >
                  {{ updatingId === row.id ? 'Publishing…' : 'Publish' }}
                </button>
              </div>
            </div>
            </div>
            <div
              v-if="row.status === 'changes_requested'"
              class="queue-notes"
              @change="onNotesChange(row, $event)"
            >
              <AuthorField
                :id="`queue-notes-${row.id}`"
                v-model="row.reviewNotes"
                label="Notes"
                multiline
                :rows="3"
                placeholder="What needs to change?"
                :disabled="!isAdmin || savingNotesId === row.id"
              />
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
