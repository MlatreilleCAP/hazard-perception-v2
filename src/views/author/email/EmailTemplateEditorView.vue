<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EmailPreviewFrame from '@/components/author/email/EmailPreviewFrame.vue'
import EmailSectionNav from '@/components/author/email/EmailSectionNav.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import {
  isEmailLocale,
  isVariableKey,
  parseEmailBlocks,
  plainTextFromHtml,
  serializeEmailBlocks,
  type EmailBlock,
} from '@/lib/email/templateDocument'
import {
  archivePublishedVersion,
  loadEmailTemplate,
  publishEmailLocale,
  saveEmailDraft,
  saveTemplateDetails,
  sendTestTemplateEmail,
} from '@/services/emailManagement'
import { useAuthStore } from '@/stores/authStore'
import type { EmailTemplateDetail, EmailTemplateVersion, EmailVariable } from '@/types/email'

const route = useRoute()
const auth = useAuthStore()

const loading = ref(true)
const saving = ref(false)
const testing = ref<'draft' | 'published' | null>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const testNotice = ref<string | null>(null)
const template = ref<EmailTemplateDetail | null>(null)
const locale = ref('en')
const localeDraft = ref('')
const name = ref('')
const description = ref('')
const subject = ref('')
const htmlBody = ref('')
const textBody = ref('')
const variables = ref<EmailVariable[]>([])
const editorMode = ref<'visual' | 'source'>('visual')
const blocks = ref<EmailBlock[]>([])
const visualSupported = ref(true)
const previewMobile = ref(false)
const viewingVersionId = ref<string | null>(null)
const activeBlock = ref(0)
const variableKey = ref('')
const variableSample = ref('')
const variableDescription = ref('')
const variableRequired = ref(true)

const templateKey = computed(() => String(route.params.key ?? ''))
const authManaged = computed(() => template.value?.source === 'auth_hook')
const locales = computed(() => {
  const values = new Set(template.value?.versions.map((version) => version.locale) ?? [])
  if (!authManaged.value) values.add(locale.value)
  return [...values].sort()
})
const localeVersions = computed(
  () => template.value?.versions.filter((version) => version.locale === locale.value) ?? [],
)
const draftVersion = computed(
  () => localeVersions.value.find((version) => version.status === 'draft') ?? null,
)
const publishedVersion = computed(
  () => localeVersions.value.find((version) => version.status === 'published') ?? null,
)
const history = computed(() =>
  localeVersions.value
    .filter((version) => version.status !== 'draft')
    .sort((left, right) => (right.version ?? 0) - (left.version ?? 0)),
)
const viewingHistory = computed(() =>
  history.value.find((version) => version.id === viewingVersionId.value) ?? null,
)
const previewSubject = computed(() => viewingHistory.value?.subject ?? subject.value)
const previewHtml = computed(() => viewingHistory.value?.htmlBody ?? htmlBody.value)
const previewVariables = computed(() => viewingHistory.value?.variables ?? variables.value)

watch(templateKey, () => {
  void load()
}, { immediate: true })

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  notice.value = null
  viewingVersionId.value = null
  try {
    const detail = await loadEmailTemplate(templateKey.value)
    template.value = detail
    if (!detail || detail.source === 'auth_hook') return
    name.value = detail.name
    description.value = detail.description
    const preferred = detail.versions.find((version) => version.locale === 'en')?.locale
      ?? detail.versions[0]?.locale
      ?? 'en'
    selectLocale(preferred, detail)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load the template'
  } finally {
    loading.value = false
  }
}

function selectLocale(next: string, detail = template.value): void {
  locale.value = next
  viewingVersionId.value = null
  if (!detail) return
  const versions = detail.versions.filter((version) => version.locale === next)
  const draft = versions.find((version) => version.status === 'draft')
  const published = versions.find((version) => version.status === 'published')
  const source = draft ?? published
  subject.value = source?.subject ?? ''
  htmlBody.value = source?.htmlBody ?? '<p></p>'
  textBody.value = source?.textBody ?? ''
  variables.value = source ? source.variables.map((variable) => ({ ...variable })) : []
  syncVisualFromHtml()
}

function syncVisualFromHtml(): void {
  const parsed = parseEmailBlocks(htmlBody.value)
  if (parsed) {
    blocks.value = parsed
    visualSupported.value = true
    return
  }
  visualSupported.value = false
  editorMode.value = 'source'
}

function syncHtmlFromBlocks(): void {
  htmlBody.value = serializeEmailBlocks(blocks.value)
}

function useSourceMode(): void {
  editorMode.value = 'source'
}

function useVisualMode(): void {
  const parsed = parseEmailBlocks(htmlBody.value)
  if (!parsed) {
    error.value = 'This HTML uses markup the visual editor cannot edit. Stay in HTML mode, or simplify the markup.'
    return
  }
  error.value = null
  blocks.value = parsed
  visualSupported.value = true
  editorMode.value = 'visual'
}

function addBlock(kind: EmailBlock['kind']): void {
  if (kind === 'heading') blocks.value.push({ kind, text: 'Heading' })
  if (kind === 'paragraph') blocks.value.push({ kind, text: '' })
  if (kind === 'button') blocks.value.push({ kind, label: 'Open Inroads', href: '{{product_url}}' })
  activeBlock.value = blocks.value.length - 1
  syncHtmlFromBlocks()
}

function removeBlock(index: number): void {
  blocks.value.splice(index, 1)
  activeBlock.value = Math.max(0, index - 1)
  syncHtmlFromBlocks()
}

function onBlockInput(): void {
  syncHtmlFromBlocks()
}

function insertToken(token: string, target: HTMLInputElement | HTMLTextAreaElement | null): void {
  if (!target) {
    subject.value += token
    return
  }
  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start
  const next = `${target.value.slice(0, start)}${token}${target.value.slice(end)}`
  if (target.dataset.field === 'subject') subject.value = next
  if (target.dataset.field === 'html') {
    htmlBody.value = next
    syncVisualFromHtml()
  }
  if (target.dataset.field === 'text') textBody.value = next
}

function insertVariable(key: string): void {
  const token = `{{${key}}}`
  if (editorMode.value === 'visual' && blocks.value.length > 0) {
    const index = Math.min(activeBlock.value, blocks.value.length - 1)
    const block = blocks.value[index]
    if (block.kind === 'button') block.label += token
    else block.text += token
    syncHtmlFromBlocks()
    return
  }
  const active = document.activeElement
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    insertToken(token, active)
    return
  }
  subject.value += token
}

function addVariable(): void {
  error.value = null
  const key = variableKey.value.trim()
  if (!isVariableKey(key)) {
    error.value = 'Variable keys start with a letter and use lowercase letters, numbers, and underscores.'
    return
  }
  if (variables.value.some((variable) => variable.key === key)) {
    error.value = `Variable ${key} is already on this template.`
    return
  }
  variables.value.push({
    key,
    required: variableRequired.value,
    sample: variableSample.value,
    description: variableDescription.value.trim(),
  })
  variableKey.value = ''
  variableSample.value = ''
  variableDescription.value = ''
  variableRequired.value = true
}

function removeVariable(key: string): void {
  variables.value = variables.value.filter((variable) => variable.key !== key)
}

function fillTextFromHtml(): void {
  textBody.value = plainTextFromHtml(htmlBody.value)
}

function draftInput() {
  return {
    templateId: template.value?.id ?? '',
    locale: locale.value,
    subject: subject.value,
    htmlBody: htmlBody.value,
    textBody: textBody.value,
    variables: variables.value,
    createdBy: auth.userId,
  }
}

async function saveDetails(): Promise<void> {
  if (!template.value || authManaged.value) return
  saving.value = true
  error.value = null
  notice.value = null
  try {
    await saveTemplateDetails(template.value.id, name.value, description.value)
    template.value.name = name.value.trim()
    template.value.description = description.value.trim()
    notice.value = 'Name and description saved.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to save the template'
  } finally {
    saving.value = false
  }
}

async function saveDraft(): Promise<void> {
  if (!template.value || authManaged.value) return
  if (editorMode.value === 'visual') syncHtmlFromBlocks()
  saving.value = true
  error.value = null
  notice.value = null
  try {
    await saveEmailDraft(draftInput(), draftVersion.value?.id ?? null)
    notice.value = 'Draft saved.'
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to save the draft'
  } finally {
    saving.value = false
  }
}

async function publish(): Promise<void> {
  if (!template.value || authManaged.value) return
  if (editorMode.value === 'visual') syncHtmlFromBlocks()
  saving.value = true
  error.value = null
  notice.value = null
  try {
    await publishEmailLocale(draftInput(), draftVersion.value?.id ?? null)
    notice.value = publishedVersion.value
      ? 'Published a new version. The previous published version was archived and kept.'
      : 'Published this version. Published content cannot be edited.'
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to publish'
  } finally {
    saving.value = false
  }
}

async function sendTest(source: 'draft' | 'published'): Promise<void> {
  if (!template.value || authManaged.value) return
  if (source === 'published' && !publishedVersion.value) return
  testing.value = source
  error.value = null
  testNotice.value = null
  try {
    if (source === 'draft') {
      if (editorMode.value === 'visual') syncHtmlFromBlocks()
      await saveEmailDraft(draftInput(), draftVersion.value?.id ?? null)
    }
    await sendTestTemplateEmail({
      templateKey: template.value.key,
      locale: locale.value,
      source,
    })
    testNotice.value = source === 'draft'
      ? 'Draft test sent to your email address. The subject starts with [Test]. Automations do not use this draft.'
      : 'Published template test sent to your email address. The subject starts with [Test].'
    if (source === 'draft') await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The test email could not be sent.'
  } finally {
    testing.value = null
  }
}

async function archivePublished(): Promise<void> {
  if (!publishedVersion.value) return
  saving.value = true
  error.value = null
  notice.value = null
  try {
    await archivePublishedVersion(publishedVersion.value.id)
    notice.value = 'Archived the published version. It stays on record and cannot be edited.'
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to archive'
  } finally {
    saving.value = false
  }
}

function showHistory(version: EmailTemplateVersion): void {
  viewingVersionId.value = viewingVersionId.value === version.id ? null : version.id
}

function copyHistoryIntoDraft(version: EmailTemplateVersion): void {
  subject.value = version.subject
  htmlBody.value = version.htmlBody
  textBody.value = version.textBody
  variables.value = version.variables.map((variable) => ({ ...variable }))
  viewingVersionId.value = null
  syncVisualFromHtml()
  notice.value = 'Copied into the draft. Save the draft to keep it. The archived version was not changed.'
}

function addLocale(): void {
  const next = localeDraft.value.trim()
  if (!isEmailLocale(next)) {
    error.value = 'Use a locale such as en or fr-CA.'
    return
  }
  error.value = null
  localeDraft.value = ''
  selectLocale(next)
  if (!draftVersion.value && !publishedVersion.value) {
    subject.value = ''
    htmlBody.value = '<p></p>'
    textBody.value = ''
    variables.value = []
    syncVisualFromHtml()
  }
}

function formatWhen(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner email-editor-inner author-stack-sm">
      <EmailSectionNav />

      <p v-if="loading" class="author-muted">Loading template…</p>
      <p v-else-if="!template" class="auth-error" role="alert">This template was not found.</p>

      <template v-else>
        <div class="author-page-header">
          <div>
            <h1>{{ template.name }}</h1>
            <p><code>{{ template.key }}</code></p>
          </div>
          <RouterLink to="/studio/email/templates" class="author-pill author-pill-ghost">Back to templates</RouterLink>
        </div>

        <p v-if="authManaged" class="email-auth-banner" role="note">
          Managed by Supabase Auth. Welcome, invitation, and password reset messages are sent by
          the Auth email function. This template cannot be edited, published, archived, deleted,
          or sent from Studio.
        </p>
        <p v-else class="email-auth-banner">
          Published versions are immutable. Publishing archives the current published version and
          keeps it. Edit the draft, then publish a new version.
        </p>

        <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
        <p v-if="testNotice" class="author-readonly-banner" role="status">{{ testNotice }}</p>

        <template v-if="!authManaged">
          <form class="author-panel" @submit.prevent="saveDetails">
            <label class="email-field">
              <span>Name</span>
              <input v-model="name" required />
            </label>
            <label class="email-field">
              <span>Description</span>
              <textarea v-model="description" rows="2" />
            </label>
            <AuthorPillButton type="submit" variant="white" :disabled="saving">Save details</AuthorPillButton>
          </form>

          <div class="email-locale-bar">
            <label class="email-field">
              <span>Locale</span>
              <select :value="locale" @change="selectLocale(($event.target as HTMLSelectElement).value)">
                <option v-for="item in locales" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="email-field">
              <span>Add locale</span>
              <input v-model="localeDraft" placeholder="fr-CA" spellcheck="false" @keydown.enter.prevent="addLocale" />
            </label>
            <AuthorPillButton variant="white" @click="addLocale">Use locale</AuthorPillButton>
          </div>

          <div class="email-editor-layout">
            <div class="author-stack-sm">
              <label class="email-field">
                <span>Subject</span>
                <input v-model="subject" data-field="subject" />
              </label>

              <div class="email-mode-bar">
                <button type="button" class="email-text-button" :class="{ 'is-on': editorMode === 'visual' }" @click="useVisualMode">
                  Visual
                </button>
                <button type="button" class="email-text-button" :class="{ 'is-on': editorMode === 'source' }" @click="useSourceMode">
                  HTML
                </button>
              </div>

              <div v-if="editorMode === 'visual'" class="author-stack-sm">
                <p v-if="!visualSupported" class="author-muted">
                  This message uses custom HTML. Switch to HTML to edit it.
                </p>
                <article
                  v-for="(block, index) in blocks"
                  :key="index"
                  class="email-block"
                  :class="{ 'is-active': activeBlock === index }"
                  @click="activeBlock = index"
                >
                  <input
                    v-if="block.kind === 'heading'"
                    v-model="block.text"
                    aria-label="Heading"
                    @input="onBlockInput"
                  />
                  <textarea
                    v-else-if="block.kind === 'paragraph'"
                    v-model="block.text"
                    rows="3"
                    aria-label="Paragraph"
                    @input="onBlockInput"
                  />
                  <template v-else>
                    <input v-model="block.label" aria-label="Button label" @input="onBlockInput" />
                    <input v-model="block.href" aria-label="Button link" spellcheck="false" @input="onBlockInput" />
                  </template>
                  <button type="button" class="email-text-button" @click="removeBlock(index)">Remove</button>
                </article>
                <div class="author-section-actions">
                  <AuthorPillButton variant="white" @click="addBlock('heading')">Heading</AuthorPillButton>
                  <AuthorPillButton variant="white" @click="addBlock('paragraph')">Paragraph</AuthorPillButton>
                  <AuthorPillButton variant="white" @click="addBlock('button')">Button</AuthorPillButton>
                </div>
              </div>

              <label v-else class="email-field">
                <span>HTML body</span>
                <textarea v-model="htmlBody" data-field="html" rows="14" spellcheck="false" class="email-code" />
              </label>

              <label class="email-field">
                <span>Plain text</span>
                <textarea v-model="textBody" data-field="text" rows="8" class="email-code" />
              </label>
              <AuthorPillButton variant="white" @click="fillTextFromHtml">Fill plain text from HTML</AuthorPillButton>

              <section class="author-panel">
                <h2 class="email-section-title">Variables</h2>
                <ul class="email-variable-list">
                  <li v-for="variable in variables" :key="variable.key">
                    <div>
                      <p class="author-list-title"><code>{{ variable.key }}</code></p>
                      <p class="author-list-sub">
                        {{ variable.required ? 'Required' : 'Optional' }}
                        · Sample: {{ variable.sample || '—' }}
                        · {{ variable.description || 'No description' }}
                      </p>
                    </div>
                    <div class="author-section-actions">
                      <button type="button" class="email-text-button" @click="insertVariable(variable.key)">Insert</button>
                      <button type="button" class="email-text-button" @click="removeVariable(variable.key)">Remove</button>
                    </div>
                  </li>
                </ul>
                <div class="email-variable-add">
                  <input v-model="variableKey" placeholder="lesson_title" spellcheck="false" aria-label="Variable key" />
                  <input v-model="variableSample" placeholder="Sample value" aria-label="Sample value" />
                  <input v-model="variableDescription" placeholder="Description" aria-label="Variable description" />
                  <label class="email-check">
                    <input v-model="variableRequired" type="checkbox" />
                    Required
                  </label>
                  <AuthorPillButton variant="white" @click="addVariable">Add variable</AuthorPillButton>
                </div>
              </section>

              <section class="author-stack-sm">
                <h2 class="email-section-title">Versions for {{ locale }}</h2>
                <p class="author-muted">
                  Published and archived versions stay as they were saved. Opening one previews it
                  and does not change it.
                </p>
                <p v-if="history.length === 0" class="author-muted">No published version for this locale yet.</p>
                <ul v-else class="author-list">
                  <li v-for="version in history" :key="version.id" class="author-list-row">
                    <div style="min-width: 0; flex: 1">
                      <p class="author-list-title">
                        Version {{ version.version }} · {{ version.status }}
                      </p>
                      <p class="author-list-sub">
                        {{ version.subject || 'No subject' }} · {{ formatWhen(version.publishedAt ?? version.updatedAt) }}
                      </p>
                    </div>
                    <div class="author-section-actions">
                      <button type="button" class="email-text-button" @click="showHistory(version)">
                        {{ viewingVersionId === version.id ? 'Hide' : 'Preview' }}
                      </button>
                      <button type="button" class="email-text-button" @click="copyHistoryIntoDraft(version)">
                        Copy into draft
                      </button>
                    </div>
                  </li>
                </ul>
              </section>

              <div class="author-section-actions">
                <AuthorPillButton variant="white" :disabled="saving || testing !== null" @click="saveDraft">
                  {{ saving ? 'Saving…' : 'Save draft' }}
                </AuthorPillButton>
                <AuthorPillButton variant="primary" :disabled="saving || testing !== null" @click="publish">Publish</AuthorPillButton>
                <AuthorPillButton
                  v-if="publishedVersion"
                  variant="ghost"
                  :disabled="saving || testing !== null"
                  @click="archivePublished"
                >
                  Archive published
                </AuthorPillButton>
              </div>
              <section class="author-stack-sm">
                <h2 class="email-section-title">Send a test</h2>
                <p class="author-muted">
                  The test goes to the signed-in administrator. A draft test uses the saved draft for this locale.
                  A published test uses the published version. Neither choice can set another recipient.
                </p>
                <div class="author-section-actions">
                  <AuthorPillButton variant="white" :disabled="saving || testing !== null" @click="sendTest('draft')">
                    {{ testing === 'draft' ? 'Sending draft test…' : 'Send draft test' }}
                  </AuthorPillButton>
                  <AuthorPillButton
                    variant="white"
                    :disabled="saving || testing !== null || !publishedVersion"
                    @click="sendTest('published')"
                  >
                    {{ testing === 'published' ? 'Sending published test…' : 'Send published test' }}
                  </AuthorPillButton>
                </div>
              </section>
            </div>

            <aside class="email-preview-panel">
              <div class="email-mode-bar">
                <button type="button" class="email-text-button" :class="{ 'is-on': !previewMobile }" @click="previewMobile = false">
                  Desktop
                </button>
                <button type="button" class="email-text-button" :class="{ 'is-on': previewMobile }" @click="previewMobile = true">
                  Mobile
                </button>
              </div>
              <p class="author-list-sub">Preview uses sample variable values. Scripts are not run.</p>
              <EmailPreviewFrame
                :subject="previewSubject"
                :html="previewHtml"
                :variables="previewVariables"
                :mobile="previewMobile"
              />
            </aside>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
