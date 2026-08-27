<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { useActivityStore } from '@/stores/activityStore'
import { isAnticipateActivity } from '@/types/anticipate'
import { isInroadsMvpActivity, isInroadsMvpChildActivity } from '@/types/inroadsMvp'
import { isLessonActivity } from '@/types/lesson'
import { isProcessActivity } from '@/types/process'
import { isSeeActivity } from '@/types/see'

const activities = useActivityStore()
const { canEdit } = useStudioAccess()
const menuOpenId = ref<string | null>(null)
const removingId = ref<string | null>(null)

const items = computed(() =>
  activities.summaries
    .filter((item) => item.published && !isInroadsMvpChildActivity(item.tags))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
)

onMounted(async () => {
  await activities.refreshList()
})

function kindLabel(tags: string[]): string {
  if (isInroadsMvpActivity(tags)) return 'Inroads MVP'
  if (isLessonActivity(tags)) return 'Compiled Lesson'
  if (isSeeActivity(tags)) return 'Observe'
  if (isProcessActivity(tags)) return 'Process'
  if (isAnticipateActivity(tags)) return 'Anticipate'
  return 'Activity'
}

function studioPath(id: string, tags: string[]): string {
  if (isInroadsMvpActivity(tags)) return `/studio/inroads-mvp/${id}`
  if (isLessonActivity(tags)) return `/studio/lesson/${id}`
  if (isSeeActivity(tags)) return `/studio/see/${id}`
  if (isProcessActivity(tags)) return `/studio/process/${id}`
  if (isAnticipateActivity(tags)) return `/studio/anticipate/${id}`
  return '/studio'
}

async function remove(id: string, title: string, tags: string[]): Promise<void> {
  menuOpenId.value = null
  if (
    !window.confirm(
      `Remove "${title}" from authoring and training? Published snapshots stay in the database but learners will no longer see this activity.`,
    )
  ) {
    return
  }

  removingId.value = id
  try {
    let childIds: string[] = []
    if (isInroadsMvpActivity(tags)) {
      await activities.load(id)
      const mvp = activities.current ? readInroadsMvpDefinition(activities.current) : null
      if (mvp) {
        childIds = [mvp.seeActivityId, mvp.processActivityId, mvp.anticipateActivityId]
      }
    }
    await activities.remove(id)
    for (const childId of childIds) {
      try {
        await activities.remove(childId)
      } catch {
        // Parent already removed; ignore child cleanup failures.
      }
    }
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove activity')
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>Published</h1>
          <p>Remove published activities from training without hard-deleting versions</p>
        </div>
      </div>

      <p v-if="activities.error" class="author-error">{{ activities.error }}</p>

      <section class="author-list-card">
        <div class="author-list-card-head">
          <h2>Published activities</h2>
          <span class="author-count">{{ items.length }}</span>
        </div>

        <div v-if="items.length === 0" class="author-list-empty">
          <p class="author-muted">No published activities.</p>
        </div>

        <ul v-else class="author-list">
          <li v-for="item in items" :key="item.id" class="author-list-row">
            <div style="min-width: 0; flex: 1">
              <RouterLink :to="studioPath(item.id, item.tags)" class="author-list-title">
                {{ item.title }}
              </RouterLink>
              <p class="author-list-sub">
                {{ kindLabel(item.tags)
                }}{{ canEdit(item.createdBy) ? '' : ' · View only' }}
              </p>
            </div>
            <AuthorStatusChip label="PUBLISHED" />
            <div class="author-menu">
              <button
                type="button"
                class="author-menu-btn"
                aria-label="More actions"
                @click="menuOpenId = menuOpenId === item.id ? null : item.id"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                  <circle cx="8" cy="3.5" r="1.25" />
                  <circle cx="8" cy="8" r="1.25" />
                  <circle cx="8" cy="12.5" r="1.25" />
                </svg>
              </button>
              <div v-if="menuOpenId === item.id" class="author-menu-panel" role="menu">
                <RouterLink
                  :to="studioPath(item.id, item.tags)"
                  class="author-menu-item"
                  role="menuitem"
                >
                  {{ canEdit(item.createdBy) ? 'Open' : 'View' }}
                </RouterLink>
                <RouterLink
                  :to="{ path: '/player', query: { activity: item.id } }"
                  class="author-menu-item"
                  role="menuitem"
                >
                  Play
                </RouterLink>
                <button
                  v-if="canEdit(item.createdBy)"
                  type="button"
                  class="author-menu-item danger"
                  role="menuitem"
                  :disabled="removingId === item.id"
                  @click="remove(item.id, item.title, item.tags)"
                >
                  {{ removingId === item.id ? 'Removing…' : 'Remove' }}
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
