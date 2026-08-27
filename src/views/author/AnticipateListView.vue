<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { isAnticipateActivity } from '@/types/anticipate'
import { isInroadsMvpChildActivity } from '@/types/inroadsMvp'
import { useActivityStore } from '@/stores/activityStore'

const activities = useActivityStore()
const { canCreate, canEdit } = useStudioAccess()
const menuOpenId = ref<string | null>(null)

const anticipateItems = computed(() =>
  activities.summaries.filter(
    (item) => isAnticipateActivity(item.tags) && !isInroadsMvpChildActivity(item.tags),
  ),
)

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
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove anticipate')
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>Anticipate</h1>
          <p>Build anticipate scenarios with video, severity, and theory questions</p>
        </div>
        <RouterLink v-if="canCreate" to="/studio/anticipate/new" style="text-decoration: none">
          <AuthorPillButton variant="white">New Anticipate</AuthorPillButton>
        </RouterLink>
      </div>

      <p v-if="activities.error" class="author-error">{{ activities.error }}</p>

      <section class="author-list-card">
        <div class="author-list-card-head">
          <h2>Anticipate</h2>
          <span class="author-count">{{ anticipateItems.length }}</span>
        </div>

        <div v-if="anticipateItems.length === 0" class="author-list-empty">
          <p class="author-muted">No Anticipate scenarios yet.</p>
          <RouterLink
            v-if="canCreate"
            to="/studio/anticipate/new"
            class="author-list-title"
            style="display: inline-block; margin-top: 12px; font-weight: 500"
          >
            Create your first Anticipate scenario
          </RouterLink>
        </div>

        <ul v-else class="author-list">
          <li v-for="item in anticipateItems" :key="item.id" class="author-list-row">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
              <rect x="3.5" y="4.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.4" />
              <path
                d="M8 8.5h4M8 11.5h2.5"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
            </svg>
            <div style="min-width: 0; flex: 1">
              <RouterLink :to="`/studio/anticipate/${item.id}`" class="author-list-title">
                {{ item.title }}
              </RouterLink>
              <p class="author-list-sub">
                {{ item.published ? 'Published' : 'Draft'
                }}{{ canEdit(item.createdBy) ? '' : ' · View only' }}
              </p>
            </div>
            <AuthorStatusChip :label="item.published ? 'PUBLISHED' : 'DRAFT'" />
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
                  :to="`/studio/anticipate/${item.id}`"
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
