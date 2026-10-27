<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { duplicateInroadsMvpVersion } from '@/services/createInroadsMvp'
import { removeInroadsMvpLessonGroup } from '@/services/removeInroadsMvp'
import { useActivityStore } from '@/stores/activityStore'
import { isInroadsMvpActivity } from '@/types/inroadsMvp'
import type { ActivitySummary } from '@/types/activity'
import { lessonVersionKey } from '@/lib/inroadsMvp/lessonVersions'

const activities = useActivityStore()
const router = useRouter()
const { canCreate, canEditLesson, canRemoveLesson } = useStudioAccess()
const menuOpenId = ref<string | null>(null)
const searchQuery = ref('')
const duplicatingId = ref<string | null>(null)

const items = computed(() =>
  activities.summaries.filter((item) => isInroadsMvpActivity(item.tags)),
)

type LessonListRow = {
  key: string
  title: string
  id: string
  published: boolean
  openedPublished: boolean
  updatedAt: string
  createdBy: string | null
  versionCount: number
}

function groupLessonRows(summaries: ActivitySummary[]): LessonListRow[] {
  const groups = new Map<string, ActivitySummary[]>()
  for (const item of summaries) {
    const key = lessonVersionKey(item.title)
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }

  return Array.from(groups.values())
    .map((group) => {
      const sorted = [...group].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      const representative = sorted[0]
      return {
        key: lessonVersionKey(representative.title),
        title: representative.title,
        id: representative.id,
        published: group.some((item) => item.published),
        openedPublished: representative.published,
        updatedAt: representative.updatedAt,
        createdBy: representative.createdBy,
        versionCount: group.length,
      }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

const lessonRows = computed(() => groupLessonRows(items.value))

function languagesLabel(count: number): string {
  return count === 1 ? '1 language' : `${count} languages`
}

const filtered = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return lessonRows.value
  return lessonRows.value.filter((item) => {
    const status = item.published ? 'published' : 'draft'
    return item.title.toLowerCase().includes(query) || status.includes(query)
  })
})

onMounted(async () => {
  await activities.refreshList()
})

function nextCopyTitle(title: string): string {
  const taken = new Set(items.value.map((item) => lessonVersionKey(item.title)))
  const base = `${title.trim()} copy`
  if (!taken.has(lessonVersionKey(base))) return base
  let count = 2
  while (taken.has(lessonVersionKey(`${base} ${count}`))) count += 1
  return `${base} ${count}`
}

async function duplicate(row: LessonListRow): Promise<void> {
  if (!canCreate.value || duplicatingId.value) return
  menuOpenId.value = null
  duplicatingId.value = row.id
  try {
    const nextId = await duplicateInroadsMvpVersion(row.id, '', {
      title: nextCopyTitle(row.title),
    })
    await activities.refreshList()
    await router.push(`/studio/inroads-mvp/${nextId}`)
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to duplicate lesson')
  } finally {
    duplicatingId.value = null
  }
}

async function remove(row: LessonListRow): Promise<void> {
  menuOpenId.value = null
  const message =
    row.versionCount > 1
      ? `Remove "${row.title}" and all ${row.versionCount} languages from authoring and training? The records will be kept in the database.`
      : `Remove "${row.title}" from authoring and training? The record will be kept in the database.`
  if (!window.confirm(message)) {
    return
  }
  try {
    await removeInroadsMvpLessonGroup(row.title, items.value)
    await activities.refreshList()
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove lesson')
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>Inroads MVP</h1>
          <p>One lesson with Observe, Process, and Anticipate sections</p>
        </div>
        <RouterLink
          v-if="canCreate"
          to="/studio/inroads-mvp/new"
          style="text-decoration: none"
        >
          <AuthorPillButton variant="white">New Inroads MVP</AuthorPillButton>
        </RouterLink>
      </div>

      <p v-if="activities.error" class="author-error">{{ activities.error }}</p>

      <section class="author-list-card">
        <div class="author-list-card-head media-library-head">
          <h2>Inroads MVP</h2>
          <span class="author-count">{{ filtered.length }}</span>
          <label class="media-library-search">
            <span class="sr-only">Search Inroads MVP</span>
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search"
              autocomplete="off"
            />
          </label>
        </div>

        <div v-if="lessonRows.length === 0" class="author-list-empty">
          <p class="author-muted">No Inroads MVP lessons yet.</p>
          <RouterLink
            v-if="canCreate"
            to="/studio/inroads-mvp/new"
            class="author-list-title"
            style="display: inline-block; margin-top: 12px; font-weight: 500"
          >
            Create your first Inroads MVP
          </RouterLink>
        </div>

        <div v-else-if="filtered.length === 0" class="author-list-empty">
          <p class="author-muted">No lessons match this search.</p>
        </div>

        <ul v-else class="author-list">
          <li v-for="item in filtered" :key="item.key" class="author-list-row">
            <div style="min-width: 0; flex: 1">
              <RouterLink :to="`/studio/inroads-mvp/${item.id}`" class="author-list-title">
                {{ item.title }}
              </RouterLink>
              <p class="author-list-sub">
                {{ item.published ? 'Published' : 'Draft'
                }}{{ canEditLesson(item.createdBy, item.openedPublished) ? '' : ' · View only' }}
                · {{ languagesLabel(item.versionCount) }}
              </p>
            </div>
            <AuthorStatusChip :label="item.published ? 'PUBLISHED' : 'DRAFT'" />
            <div class="author-menu">
              <button
                type="button"
                class="author-menu-btn"
                aria-label="More actions"
                @click="menuOpenId = menuOpenId === item.key ? null : item.key"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                  <circle cx="8" cy="3.5" r="1.25" />
                  <circle cx="8" cy="8" r="1.25" />
                  <circle cx="8" cy="12.5" r="1.25" />
                </svg>
              </button>
              <div v-if="menuOpenId === item.key" class="author-menu-panel" role="menu">
                <RouterLink
                  :to="`/studio/inroads-mvp/${item.id}`"
                  class="author-menu-item"
                  role="menuitem"
                >
                  {{ canEditLesson(item.createdBy, item.openedPublished) ? 'Open' : 'View' }}
                </RouterLink>
                <button
                  v-if="canCreate"
                  type="button"
                  class="author-menu-item"
                  role="menuitem"
                  :disabled="duplicatingId === item.id"
                  @click="duplicate(item)"
                >
                  {{ duplicatingId === item.id ? 'Duplicating…' : 'Duplicate' }}
                </button>
                <button
                  v-if="canRemoveLesson(item.createdBy, item.published)"
                  type="button"
                  class="author-menu-item danger"
                  role="menuitem"
                  @click="remove(item)"
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
