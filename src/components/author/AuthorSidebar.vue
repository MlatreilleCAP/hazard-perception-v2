<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const auth = useAuthStore()
const mvpOpen = computed(
  () =>
    route.path === '/studio/inroads-mvp' || route.path.startsWith('/studio/inroads-mvp/'),
)
const introductionOpen = computed(
  () =>
    route.path === '/studio/stand-alone-video' ||
    route.path.startsWith('/studio/stand-alone-video/') ||
    route.path === '/studio/introduction' ||
    route.path.startsWith('/studio/introduction/'),
)
const mediaOpen = computed(
  () => route.path === '/studio/media' || route.path.startsWith('/studio/media/'),
)
const scoringOpen = computed(
  () =>
    route.path === '/studio/inroads-scoring' || route.path.startsWith('/studio/inroads-scoring/'),
)
const queueOpen = computed(
  () => route.path === '/studio/queue' || route.path.startsWith('/studio/queue/'),
)
const peopleOpen = computed(
  () => route.path === '/studio/people' || route.path.startsWith('/studio/people/'),
)
</script>

<template>
  <aside class="author-sidebar">
    <div class="author-sidebar-top">
      <RouterLink to="/" class="author-home" aria-label="Back to home">
        <svg viewBox="0 0 24 24" width="23" height="23" fill="none" aria-hidden="true">
          <path
            d="M15.5 5.5 9 12l6.5 6.5"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </RouterLink>
      <p class="author-suite-title">Admin suite</p>
    </div>

    <nav class="author-nav" aria-label="Authoring">
      <RouterLink
        to="/studio/inroads-mvp"
        class="author-nav-link"
        :class="{ active: mvpOpen }"
      >
        Inroads MVP
      </RouterLink>
      <RouterLink
        to="/studio/inroads-scoring"
        class="author-nav-link"
        :class="{ active: scoringOpen }"
      >
        Inroads Scoring
      </RouterLink>
      <RouterLink
        to="/studio/stand-alone-video"
        class="author-nav-link"
        :class="{ active: introductionOpen }"
      >
        Stand Alone Video
      </RouterLink>
      <RouterLink
        to="/studio/media"
        class="author-nav-link"
        :class="{ active: mediaOpen }"
      >
        Media
      </RouterLink>
      <RouterLink
        to="/studio/queue"
        class="author-nav-link"
        :class="{ active: queueOpen }"
      >
        Queue (Not in Scope)
      </RouterLink>
      <RouterLink
        v-if="auth.isAdmin"
        to="/studio/people"
        class="author-nav-link"
        :class="{ active: peopleOpen }"
      >
        People
      </RouterLink>
    </nav>
  </aside>
</template>
