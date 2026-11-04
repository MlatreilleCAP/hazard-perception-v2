<script setup lang="ts">
import { onMounted, ref } from 'vue'
import EmailSectionNav from '@/components/author/email/EmailSectionNav.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { useEmailAccess } from '@/composables/useEmailAccess'
import { loadEmailSettings, saveEmailSettings } from '@/services/emailManagement'
import { useAuthStore } from '@/stores/authStore'
import type { EmailSettingsDetail } from '@/types/email'

const auth = useAuthStore()
const settings = ref<EmailSettingsDetail | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const { stillAllowed, reportEmailFailure } = useEmailAccess(() => {
  settings.value = null
})

onMounted(() => {
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const loaded = await loadEmailSettings()
    if (!stillAllowed()) return
    settings.value = loaded
  } catch (cause) {
    error.value = await reportEmailFailure(cause)
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!settings.value) return
  saving.value = true
  error.value = null
  notice.value = null
  try {
    await saveEmailSettings(settings.value, auth.userId)
    if (!stillAllowed()) return
    notice.value = 'Email settings saved.'
    const loaded = await loadEmailSettings()
    if (!stillAllowed()) return
    settings.value = loaded
  } catch (cause) {
    error.value = await reportEmailFailure(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <EmailSectionNav />
      <div class="author-page-header">
        <div>
          <h1>Settings</h1>
          <p>Sender details stored for AlertDriving application email.</p>
        </div>
      </div>

      <p class="email-auth-banner">
        API keys, webhook secrets, and other credentials stay in Supabase Edge Function secrets.
        This screen cannot view or change them.
      </p>

      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="author-readonly-banner" role="status">{{ notice }}</p>
      <p v-if="loading" class="author-muted">Loading settings…</p>
      <p v-else-if="!settings" class="author-muted">Email settings have not been saved for this organization.</p>

      <form v-else class="author-panel" @submit.prevent="save">
        <label class="email-field">
          <span>Organization</span>
          <input :value="settings.organizationName" readonly />
        </label>
        <label class="email-field">
          <span>Sender name</span>
          <input v-model="settings.fromName" required />
        </label>
        <label class="email-field">
          <span>Sender email</span>
          <input v-model="settings.fromEmail" type="email" required />
        </label>
        <label class="email-field">
          <span>Product URL</span>
          <input v-model="settings.productUrl" type="url" required />
        </label>
        <label class="email-field">
          <span>Reply-to</span>
          <input v-model="settings.replyTo" type="email" placeholder="Optional" />
        </label>
        <label class="email-field">
          <span>Support address</span>
          <input v-model="settings.supportAddress" type="email" placeholder="Optional" />
        </label>
        <label class="email-field">
          <span>Default locale</span>
          <input v-model="settings.defaultLocale" required spellcheck="false" placeholder="en" />
        </label>
        <AuthorPillButton type="submit" variant="primary" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save settings' }}
        </AuthorPillButton>
      </form>
    </div>
  </div>
</template>
