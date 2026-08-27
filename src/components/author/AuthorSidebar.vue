<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
const mvpOpen = computed(
  () =>
    route.path === '/studio/inroads-mvp' || route.path.startsWith('/studio/inroads-mvp/'),
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

      <span class="author-nav-disabled">Media</span>
      <span class="author-nav-disabled">Publishing</span>
    </nav>
  </aside>
</template>
