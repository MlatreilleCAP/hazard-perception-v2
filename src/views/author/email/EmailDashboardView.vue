<script setup lang="ts">
import { onMounted, ref } from 'vue'
import EmailSectionNav from '@/components/author/email/EmailSectionNav.vue'
import { useEmailAccess } from '@/composables/useEmailAccess'
import { loadEmailDashboard } from '@/services/emailManagement'
import type { EmailDashboard } from '@/types/email'

const loading = ref(true)
const error = ref<string | null>(null)
const dashboard = ref<EmailDashboard | null>(null)
const { stillAllowed, reportEmailFailure } = useEmailAccess(() => {
  dashboard.value = null
})

const stats = [
  { key: 'totalTemplates', label: 'Total templates' },
  { key: 'publishedTemplates', label: 'Published templates' },
  { key: 'draftTemplates', label: 'Draft templates' },
  { key: 'enabledAutomations', label: 'Enabled automations' },
  { key: 'emailsSent', label: 'Emails sent' },
] as const

onMounted(async () => {
  loading.value = true
  error.value = null
  try {
    const loaded = await loadEmailDashboard()
    if (!stillAllowed()) return
    dashboard.value = loaded
  } catch (cause) {
    error.value = await reportEmailFailure(cause)
  } finally {
    loading.value = false
  }
})

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <EmailSectionNav />

      <div class="author-page-header">
        <div>
          <h1>Email</h1>
          <p>Templates, automations, and delivery for AlertDriving.</p>
        </div>
      </div>

      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
      <p v-else-if="loading" class="author-muted">Loading email…</p>

      <template v-else-if="dashboard">
        <ul class="email-stat-grid">
          <li v-for="stat in stats" :key="stat.key" class="email-stat">
            <span>{{ stat.label }}</span>
            <strong>{{ dashboard[stat.key] }}</strong>
          </li>
        </ul>

        <section class="author-stack-sm">
          <h2 class="email-section-title">Recent email activity</h2>
          <p v-if="dashboard.recent.length === 0" class="author-muted">No email activity yet.</p>
          <ul v-else class="author-list">
            <li v-for="item in dashboard.recent" :key="item.id" class="author-list-row">
              <div style="min-width: 0; flex: 1">
                <p class="author-list-title">{{ item.subject || item.templateKey }}</p>
                <p class="author-list-sub">{{ item.toEmail }} · {{ item.templateKey }}</p>
              </div>
              <p class="author-muted">{{ item.status }} · {{ formatWhen(item.createdAt) }}</p>
            </li>
          </ul>
        </section>

        <div class="author-section-actions">
          <RouterLink to="/studio/email/templates" class="author-pill author-pill-primary">
            Templates
          </RouterLink>
          <RouterLink to="/studio/email/automations" class="author-pill author-pill-ghost">
            Automations
          </RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>
