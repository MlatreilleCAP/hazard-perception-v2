<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { catalogCoverAt } from '@/app/catalogCovers'
import { useActivityStore } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'

const activities = useActivityStore()
const auth = useAuthStore()

const published = computed(() =>
  activities.summaries.filter((summary) => summary.published),
)

async function refreshCatalog(): Promise<void> {
  if (!auth.isSignedIn) return
  await activities.refreshList()
}

onMounted(async () => {
  await auth.initialize()
  await refreshCatalog()
})

watch(
  () => auth.isSignedIn,
  (signedIn) => {
    if (signedIn) void refreshCatalog()
  },
)

function coverFor(index: number): string {
  return catalogCoverAt(index)
}

function glyph(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'A'
}

function startTo(id: string) {
  return { path: '/player', query: { activity: id } }
}
</script>

<template>
  <div class="demo-catalog">
    <section class="catalog-section" aria-label="All demos">
      <div class="catalog-heading-row">
        <h2 class="catalog-kicker">All demos</h2>
      </div>

      <div
        v-if="!auth.isSignedIn"
        class="catalog-empty"
        role="status"
      >
        <p class="catalog-empty-title">Sign in to browse demos</p>
        <p class="catalog-empty-body">
          <RouterLink to="/login?next=/#demos">Sign in</RouterLink>
          to explore published activities.
        </p>
      </div>

      <div
        v-else-if="published.length === 0"
        class="catalog-empty"
        role="status"
      >
        <p class="catalog-empty-title">No demos are currently available.</p>
        <p class="catalog-empty-body">Check back soon for new demo experiences.</p>
        <p v-if="activities.error" class="catalog-empty-body">{{ activities.error }}</p>
      </div>

      <ul v-else class="catalog-grid">
        <li v-for="(item, index) in published" :key="item.id">
          <article class="activity-card">
            <div class="activity-card-cover">
              <img :src="coverFor(index)" alt="" />
              <div class="activity-glyph" aria-hidden="true">{{ glyph(item.title) }}</div>
            </div>
            <div class="activity-card-body">
              <div class="activity-card-meta">
                <span class="activity-type">Activity</span>
                <span class="activity-duration">Flexible</span>
              </div>
              <div class="activity-card-copy">
                <h3>{{ item.title }}</h3>
                <p>Interactive driver coaching activity.</p>
              </div>
              <div class="activity-card-action">
                <RouterLink :to="startTo(item.id)" class="demo-primary-button">
                  Start Activity
                </RouterLink>
              </div>
            </div>
          </article>
        </li>
      </ul>
    </section>
  </div>
</template>
