<script setup lang="ts">
import { onMounted, ref } from 'vue'
import EmailSectionNav from '@/components/author/email/EmailSectionNav.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { useEmailAccess } from '@/composables/useEmailAccess'
import { listEmailAutomations, setEmailAutomationEnabled } from '@/services/emailManagement'
import type { EmailAutomationRule } from '@/types/email'

const rules = ref<EmailAutomationRule[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const pendingId = ref<string | null>(null)
const { stillAllowed, reportEmailFailure } = useEmailAccess(() => {
  rules.value = []
})

onMounted(() => {
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const loaded = await listEmailAutomations()
    if (!stillAllowed()) return
    rules.value = loaded
  } catch (cause) {
    error.value = await reportEmailFailure(cause)
  } finally {
    loading.value = false
  }
}

async function toggle(rule: EmailAutomationRule): Promise<void> {
  pendingId.value = rule.id
  error.value = null
  const next = !rule.enabled
  try {
    await setEmailAutomationEnabled(rule.id, next)
    rule.enabled = next
  } catch (cause) {
    error.value = await reportEmailFailure(cause)
  } finally {
    pendingId.value = null
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <EmailSectionNav />
      <div class="author-page-header">
        <div>
          <h1>Automations</h1>
          <p>Rules record which template should follow an event. No event in the application sends mail from these rules yet.</p>
        </div>
      </div>

      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="author-muted">Loading automations…</p>
      <p v-else-if="rules.length === 0" class="author-muted">
        No automation rules yet. When a rule is added, it can be turned on or off here. That does not send email.
      </p>

      <div v-else class="email-table-wrap">
        <table class="email-table">
          <thead>
            <tr>
              <th>Template</th>
              <th>Trigger</th>
              <th>Status</th>
              <th>Organization</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rule in rules" :key="rule.id">
              <td>
                <p class="author-list-title">{{ rule.templateName }}</p>
                <p class="author-list-sub"><code>{{ rule.templateKey }}</code></p>
              </td>
              <td>
                <p class="author-list-title"><code>{{ rule.eventKey }}</code></p>
                <p class="author-list-sub">
                  This trigger is not connected to an application event. Enabling the rule does not send email.
                </p>
                <p v-if="rule.schedule" class="author-list-sub">Schedule: {{ rule.schedule }}</p>
              </td>
              <td>{{ rule.enabled ? 'Enabled' : 'Disabled' }}</td>
              <td>{{ rule.organizationName }}</td>
              <td>
                <AuthorPillButton
                  variant="white"
                  :disabled="pendingId === rule.id"
                  @click="toggle(rule)"
                >
                  {{ rule.enabled ? 'Disable' : 'Enable' }}
                </AuthorPillButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
