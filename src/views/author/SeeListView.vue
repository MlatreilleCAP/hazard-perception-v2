<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { useActivityStore } from '@/stores/activityStore'
import { isInroadsMvpChildActivity } from '@/types/inroadsMvp'
import { isSeeActivity } from '@/types/see'

const activities = useActivityStore()
const { canCreate, canEdit } = useStudioAccess()
const menuOpenId = ref<string | null>(null)

const seeItems = computed(() =>
  activities.summaries.filter(
    (item) => isSeeActivity(item.tags) && !isInroadsMvpChildActivity(item.tags),
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
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove scenario')
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>Observe</h1>
          <p>Build and manage hazard perception scenarios</p>
        </div>
        <RouterLink v-if="canCreate" to="/studio/see/new" style="text-decoration: none">
          <AuthorPillButton variant="white">New scenario</AuthorPillButton>
        </RouterLink>
      </div>

      <p v-if="activities.error" class="author-error">{{ activities.error }}</p>

      <section class="author-list-card">
        <div class="author-list-card-head">
          <h2>All scenarios</h2>
          <span class="author-count">{{ seeItems.length }}</span>
        </div>

        <div v-if="seeItems.length === 0" class="author-list-empty">
          <p class="author-muted">No scenarios yet.</p>
          <RouterLink
            v-if="canCreate"
            to="/studio/see/new"
            class="author-list-title"
            style="display: inline-block; margin-top: 12px; font-weight: 500"
          >
            Create your first scenario
          </RouterLink>
        </div>

        <ul v-else class="author-list">
          <li v-for="item in seeItems" :key="item.id" class="author-list-row">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
              <rect x="3.5" y="4.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.4" />
              <path d="M7.5 10.5 9.2 12l3.3-3.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div style="min-width: 0; flex: 1">
              <RouterLink :to="`/studio/see/${item.id}`" class="author-list-title">
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
                <RouterLink :to="`/studio/see/${item.id}`" class="author-menu-item" role="menuitem">
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
