<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
const processOpen = computed(
  () => route.path === '/studio/process' || route.path.startsWith('/studio/process/'),
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
      <div class="author-nav-group">
        <span class="author-nav-group-btn" style="cursor: default">
          Inroads
          <svg class="author-chevron" viewBox="0 0 12 8" fill="none" aria-hidden="true">
            <path
              d="m1 1.5 5 5 5-5"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
            />
          </svg>
        </span>
        <div class="author-nav-children">
          <span class="author-nav-disabled">See</span>
          <RouterLink
            to="/studio/process"
            class="author-nav-link"
            :class="{ active: processOpen }"
          >
            Process
          </RouterLink>
          <span class="author-nav-disabled">Anticipate</span>
          <span class="author-nav-disabled">Full Lessons</span>
        </div>
      </div>
      <span class="author-nav-disabled">Interactive activities</span>
      <span class="author-nav-disabled">Nodes</span>
      <span class="author-nav-disabled">Media</span>
      <span class="author-nav-disabled">Publishing</span>
    </nav>
  </aside>
</template>
