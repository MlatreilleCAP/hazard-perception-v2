<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EmailSectionNav from '@/components/author/email/EmailSectionNav.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSelectField from '@/components/author/AuthorSelectField.vue'
import { useEmailAccess } from '@/composables/useEmailAccess'
import { isTemplateKey } from '@/lib/email/templateDocument'
import { createApplicationTemplate, deleteApplicationTemplate, listEmailTemplates } from '@/services/emailManagement'
import { useAuthStore } from '@/stores/authStore'
import type { EmailTemplateSummary } from '@/types/email'

type StatusFilter = 'all' | 'published' | 'draft' | 'archived' | 'auth'

const router = useRouter()
const auth = useAuthStore()
const templates = ref<EmailTemplateSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const query = ref('')
const status = ref<StatusFilter>('all')
const creating = ref(false)
const saving = ref(false)
const name = ref('')
const key = ref('')
const description = ref('')
const deletingId = ref<string | null>(null)
const { stillAllowed, reportEmailFailure } = useEmailAccess(() => {
  templates.value = []
})

onMounted(() => {
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const loaded = await listEmailTemplates()
    if (!stillAllowed()) return
    templates.value = loaded
  } catch (cause) {
    error.value = await reportEmailFailure(cause)
  } finally {
    loading.value = false
  }
}

const visible = computed(() => {
  const term = query.value.trim().toLowerCase()
  return templates.value.filter((template) => {
    if (status.value === 'auth' && template.source !== 'auth_hook') return false
    if (status.value === 'published' && !template.hasPublished) return false
    if (status.value === 'draft' && !template.hasDraft) return false
    if (status.value === 'archived' && !template.hasArchived) return false
    if (!term) return true
    return (
      template.name.toLowerCase().includes(term) ||
      template.key.toLowerCase().includes(term) ||
      template.description.toLowerCase().includes(term)
    )
  })
})

function category(template: EmailTemplateSummary): string {
  return template.source === 'auth_hook' ? 'Auth' : 'Application'
}

function statusLabel(template: EmailTemplateSummary): string {
  if (template.source === 'auth_hook') return 'Auth managed'
  const parts: string[] = []
  if (template.hasPublished) parts.push('Published')
  if (template.hasDraft) parts.push('Draft')
  if (!template.hasPublished && template.hasArchived) parts.push('Archived')
  return parts.join(' · ') || 'No version'
}

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function suggestKey(): void {
  if (key.value.trim()) return
  key.value = name.value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([^a-z])/, 't_$1')
}

async function createTemplate(): Promise<void> {
  saving.value = true
  error.value = null
  try {
    suggestKey()
    if (!isTemplateKey(key.value.trim())) {
      error.value = 'Keys start with a letter and use lowercase letters, numbers, and underscores.'
      return
    }
    const createdKey = await createApplicationTemplate({
      name: name.value,
      key: key.value,
      description: description.value,
      createdBy: auth.userId,
    })
    await router.push(`/studio/email/templates/${createdKey}`)
  } catch (cause) {
    error.value = await reportEmailFailure(cause)
  } finally {
    saving.value = false
  }
}

function canDelete(template: EmailTemplateSummary): boolean {
  return template.source === 'application' && !template.hasPublished && !template.hasArchived
}

async function removeTemplate(template: EmailTemplateSummary): Promise<void> {
  if (!canDelete(template)) return
  deletingId.value = template.id
  error.value = null
  try {
    await deleteApplicationTemplate(template.id)
    templates.value = templates.value.filter((item) => item.id !== template.id)
  } catch (cause) {
    error.value = await reportEmailFailure(cause)
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <EmailSectionNav />
      <div class="author-page-header">
        <div>
          <h1>Templates</h1>
          <p>
            Application templates can be drafted and published here. Welcome, invitation, and
            password reset stay with Supabase Auth.
          </p>
        </div>
        <AuthorPillButton variant="primary" @click="creating = !creating">New template</AuthorPillButton>
      </div>

      <form v-if="creating" class="author-panel" @submit.prevent="createTemplate">
        <h2 class="email-section-title">New application template</h2>
        <label class="email-field">
          <span>Name</span>
          <input v-model="name" required @blur="suggestKey" />
        </label>
        <label class="email-field">
          <span>Key</span>
          <input v-model="key" required spellcheck="false" placeholder="training_reminder" />
        </label>
        <label class="email-field">
          <span>Description</span>
          <textarea v-model="description" rows="2" />
        </label>
        <AuthorPillButton type="submit" variant="primary" :disabled="saving">
          {{ saving ? 'Creating…' : 'Create template' }}
        </AuthorPillButton>
      </form>

      <div class="email-library-tools">
        <label class="email-field">
          <span>Search</span>
          <input v-model="query" type="search" placeholder="Name or key" />
        </label>
        <AuthorSelectField
          id="email-template-status"
          :model-value="status"
          label="Status"
          :options="[
            { value: 'all', label: 'All' },
            { value: 'published', label: 'Published' },
            { value: 'draft', label: 'Draft' },
            { value: 'archived', label: 'Archived' },
            { value: 'auth', label: 'Auth managed' },
          ]"
          @update:model-value="status = $event as StatusFilter"
        />
      </div>

      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="author-muted">Loading templates…</p>
      <p v-else-if="visible.length === 0" class="author-muted">No templates match this search.</p>

      <div v-else class="email-table-wrap">
        <table class="email-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Category</th>
              <th>Status</th>
              <th>Locale</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="template in visible" :key="template.id">
              <td>
                <RouterLink class="email-table-link" :to="`/studio/email/templates/${template.key}`">
                  {{ template.name }}
                </RouterLink>
                <p v-if="template.source === 'auth_hook'" class="author-list-sub">
                  Managed by Supabase Auth. Not editable or sendable here.
                </p>
              </td>
              <td><code>{{ template.key }}</code></td>
              <td>{{ category(template) }}</td>
              <td>{{ statusLabel(template) }}</td>
              <td>{{ template.locales.join(', ') || '—' }}</td>
              <td>{{ formatWhen(template.updatedAt) }}</td>
              <td>
                <button
                  v-if="canDelete(template)"
                  type="button"
                  class="email-text-button"
                  :disabled="deletingId === template.id"
                  @click="removeTemplate(template)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
