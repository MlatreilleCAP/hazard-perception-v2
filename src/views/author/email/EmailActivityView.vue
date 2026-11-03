<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EmailSectionNav from '@/components/author/email/EmailSectionNav.vue'
import { listEmailMessages } from '@/services/emailManagement'
import type { EmailMessageRecord, EmailMessageStatus } from '@/types/email'

const STATUSES: EmailMessageStatus[] = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'suppressed',
]

const messages = ref<EmailMessageRecord[]>([])
const truncated = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)
const query = ref('')
const status = ref<EmailMessageStatus | 'all'>('all')
const templateKey = ref('all')
const fromDate = ref('')
const toDate = ref('')

onMounted(() => {
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const result = await listEmailMessages()
    messages.value = result.messages
    truncated.value = result.truncated
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load activity'
  } finally {
    loading.value = false
  }
}

const templateOptions = computed(() => [...new Set(messages.value.map((message) => message.templateKey))].sort())

const visible = computed(() => {
  const term = query.value.trim().toLowerCase()
  return messages.value.filter((message) => {
    if (status.value !== 'all' && message.status !== status.value) return false
    if (templateKey.value !== 'all' && message.templateKey !== templateKey.value) return false
    const created = localDay(message.createdAt)
    if (fromDate.value && created < fromDate.value) return false
    if (toDate.value && created > toDate.value) return false
    if (!term) return true
    return (
      message.toEmail.toLowerCase().includes(term) ||
      message.subject.toLowerCase().includes(term) ||
      message.templateKey.toLowerCase().includes(term)
    )
  })
})

function localDay(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatWhen(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
          <h1>Activity</h1>
          <p>Delivery records stored for application email. This log is read-only.</p>
        </div>
      </div>

      <div class="email-library-tools">
        <label class="email-field">
          <span>Search</span>
          <input v-model="query" type="search" placeholder="Recipient, template, or subject" />
        </label>
        <label class="email-field">
          <span>Status</span>
          <select v-model="status">
            <option value="all">All</option>
            <option v-for="item in STATUSES" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="email-field">
          <span>Template</span>
          <select v-model="templateKey">
            <option value="all">All</option>
            <option v-for="key in templateOptions" :key="key" :value="key">{{ key }}</option>
          </select>
        </label>
        <label class="email-field">
          <span>From</span>
          <input v-model="fromDate" type="date" />
        </label>
        <label class="email-field">
          <span>To</span>
          <input v-model="toDate" type="date" />
        </label>
      </div>

      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
      <p v-if="truncated" class="author-muted">Showing the 200 most recent messages.</p>
      <p v-if="loading" class="author-muted">Loading activity…</p>
      <p v-else-if="messages.length === 0" class="author-muted">
        No email activity yet. Application messages will appear here after they are sent. Nothing has been sent from this log.
      </p>
      <p v-else-if="visible.length === 0" class="author-muted">No messages match this search.</p>

      <div v-else class="email-table-wrap">
        <table class="email-table">
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Template</th>
              <th>Locale</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Created</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="message in visible" :key="message.id">
              <td>{{ message.toEmail }}</td>
              <td><code>{{ message.templateKey }}</code></td>
              <td>{{ message.locale }}</td>
              <td>{{ message.subject || '—' }}</td>
              <td>{{ message.status }}</td>
              <td>{{ formatWhen(message.createdAt) }}</td>
              <td>{{ formatWhen(message.sentAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
