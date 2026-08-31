<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import InroadsMvpImportPanel from '@/components/author/InroadsMvpImportPanel.vue'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { useActivityStore } from '@/stores/activityStore'
import { isInroadsMvpActivity } from '@/types/inroadsMvp'

const router = useRouter()
const activities = useActivityStore()
const { canCreate, canEdit } = useStudioAccess()
const menuOpenId = ref<string | null>(null)

const items = computed(() =>
  activities.summaries.filter((item) => isInroadsMvpActivity(item.tags)),
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
    const loaded = await activities.load(id).then(() => activities.current)
    const mvp = loaded ? readInroadsMvpDefinition(loaded) : null
    const childIds = mvp
      ? [mvp.seeActivityId, mvp.processActivityId, mvp.anticipateActivityId]
      : []
    await activities.remove(id)
    for (const childId of childIds) {
      try {
        await activities.remove(childId)
      } catch {
        // Parent already removed; ignore child cleanup failures.
      }
    }
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
          <p>One lesson with intro, Observe, Process, and Anticipate sections</p>
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

      <section v-if="canCreate" class="author-list-card" style="padding: 16px 20px">
        <InroadsMvpImportPanel
          create-lesson
          @imported="(id) => router.push(`/studio/inroads-mvp/${id}`)"
        />
      </section>

      <section class="author-list-card">
        <div class="author-list-card-head">
          <h2>Inroads MVP</h2>
          <span class="author-count">{{ items.length }}</span>
        </div>

        <div v-if="items.length === 0" class="author-list-empty">
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

        <ul v-else class="author-list">
          <li v-for="item in items" :key="item.id" class="author-list-row">
            <div style="min-width: 0; flex: 1">
              <RouterLink :to="`/studio/inroads-mvp/${item.id}`" class="author-list-title">
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
                  :to="`/studio/inroads-mvp/${item.id}`"
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
