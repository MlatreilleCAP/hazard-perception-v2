<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { useActivityStore } from '@/stores/activityStore'
import { lessonVersionKey } from '@/lib/inroadsMvp/lessonVersions'
import type { ActivitySummary } from '@/types/activity'
import { isIntroductionActivity } from '@/types/introduction'

const activities = useActivityStore()
const { canCreate, canEdit } = useStudioAccess()
const menuOpenId = ref<string | null>(null)
const searchQuery = ref('')

const items = computed(() =>
  activities.summaries.filter((item) => isIntroductionActivity(item.tags)),
)

type VideoListRow = {
  key: string
  title: string
  id: string
  published: boolean
  updatedAt: string
  createdBy: string | null
  versionCount: number
}

function groupVideoRows(summaries: ActivitySummary[]): VideoListRow[] {
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
        updatedAt: representative.updatedAt,
        createdBy: representative.createdBy,
        versionCount: group.length,
      }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

const videoRows = computed(() => groupVideoRows(items.value))

function versionsLabel(count: number): string {
  return count === 1 ? '1 version' : `${count} versions`
}

const filtered = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return videoRows.value
  return videoRows.value.filter((item) => {
    const status = item.published ? 'published' : 'draft'
    return item.title.toLowerCase().includes(query) || status.includes(query)
  })
})

onMounted(async () => {
  await activities.refreshList()
})

async function remove(id: string, title: string): Promise<void> {
  menuOpenId.value = null
  if (
    !window.confirm(
      `Remove "${title}" from authoring and training? The record will be kept in the database.`,
    )
  ) {
    return
  }
  try {
    await activities.remove(id)
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove stand alone video')
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>Stand Alone Video</h1>
          <p>Build videos that play on their own, or before Observe, Process, and Anticipate</p>
        </div>
        <RouterLink
          v-if="canCreate"
          to="/studio/stand-alone-video/new"
          style="text-decoration: none"
        >
          <AuthorPillButton variant="white">New stand alone video</AuthorPillButton>
        </RouterLink>
      </div>

      <p v-if="activities.error" class="author-error">{{ activities.error }}</p>

      <section class="author-list-card">
        <div class="author-list-card-head media-library-head">
          <h2>All stand alone videos</h2>
          <span class="author-count">{{ filtered.length }}</span>
          <label class="media-library-search">
            <span class="sr-only">Search stand alone videos</span>
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search"
              autocomplete="off"
            />
          </label>
        </div>

        <div v-if="videoRows.length === 0" class="author-list-empty">
          <p class="author-muted">No stand alone videos yet.</p>
          <RouterLink
            v-if="canCreate"
            to="/studio/stand-alone-video/new"
            class="author-list-title"
            style="display: inline-block; margin-top: 12px; font-weight: 500"
          >
            Create your first stand alone video
          </RouterLink>
        </div>

        <div v-else-if="filtered.length === 0" class="author-list-empty">
          <p class="author-muted">No stand alone videos match this search.</p>
        </div>

        <ul v-else class="author-list">
          <li v-for="item in filtered" :key="item.key" class="author-list-row">
            <div style="min-width: 0; flex: 1">
              <RouterLink :to="`/studio/stand-alone-video/${item.id}`" class="author-list-title">
                {{ item.title }}
              </RouterLink>
              <p class="author-list-sub">
                {{ item.published ? 'Published' : 'Draft' }}
                · {{ versionsLabel(item.versionCount) }}{{ canEdit(item.createdBy) ? '' : ' · View only' }}
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
                  :to="`/studio/stand-alone-video/${item.id}`"
                  class="author-menu-item"
                  role="menuitem"
                >
                  {{ canEdit(item.createdBy) ? 'Open' : 'View' }}
                </RouterLink>
                <button
                  v-if="canEdit(item.createdBy)"
                  type="button"
                  class="author-menu-item danger"
                  role="menuitem"
                  @click="remove(item.id, item.title)"
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
