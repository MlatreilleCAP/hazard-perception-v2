<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const sections = [
  { label: 'Overview', to: '/studio/email', exact: true },
  { label: 'Templates', to: '/studio/email/templates', exact: false },
  { label: 'Automations', to: '/studio/email/automations', exact: false },
  { label: 'Activity', to: '/studio/email/activity', exact: false },
  { label: 'Settings', to: '/studio/email/settings', exact: false },
]

function isActive(section: (typeof sections)[number]): boolean {
  if (section.exact) return route.path === section.to
  return route.path === section.to || route.path.startsWith(`${section.to}/`)
}
</script>

<template>
  <nav class="email-section-nav" aria-label="Email management">
    <RouterLink
      v-for="section in sections"
      :key="section.to"
      :to="section.to"
      class="email-section-link"
      :class="{ active: isActive(section) }"
    >
      {{ section.label }}
    </RouterLink>
  </nav>
</template>
