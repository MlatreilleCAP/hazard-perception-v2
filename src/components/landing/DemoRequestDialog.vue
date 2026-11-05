<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { submitDemoRequest } from '@/services/demoRequest'

const open = defineModel<boolean>('open', { default: false })

const dialog = ref<HTMLElement | null>(null)
const name = ref('')
const email = ref('')
const company = ref('')
const message = ref('')
const website = ref('')
const error = ref<string | null>(null)
const submitted = ref(false)
const busy = ref(false)
let previousFocus: HTMLElement | null = null

watch(open, async (isOpen) => {
  if (!isOpen) return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  submitted.value = false
  error.value = null
  busy.value = false
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('input:not([tabindex="-1"]), button')?.focus()
})

function close(): void {
  open.value = false
  previousFocus?.focus()
  previousFocus = null
}

function resetForm(): void {
  name.value = ''
  email.value = ''
  company.value = ''
  message.value = ''
  website.value = ''
  error.value = null
  submitted.value = false
  busy.value = false
}

function onBackdropClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) close()
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab' || !dialog.value) return
  const items = [...dialog.value.querySelectorAll<HTMLElement>('button, input, textarea, select')]
    .filter((item) => !item.hasAttribute('disabled') && item.getAttribute('tabindex') !== '-1')
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

async function submit(): Promise<void> {
  error.value = null
  const trimmedName = name.value.trim()
  const trimmedEmail = email.value.trim()
  const trimmedCompany = company.value.trim()
  if (!trimmedName) {
    error.value = 'Enter your name.'
    return
  }
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    error.value = 'Enter a valid work email.'
    return
  }
  if (!trimmedCompany) {
    error.value = 'Enter your company.'
    return
  }

  busy.value = true
  try {
    await submitDemoRequest({
      name: trimmedName,
      email: trimmedEmail,
      company: trimmedCompany,
      message: message.value.trim(),
      website: website.value,
    })
    submitted.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The request could not be sent.'
  } finally {
    busy.value = false
  }
}

function closeAndReset(): void {
  close()
  resetForm()
}
</script>

<template>
  <div
    v-if="open"
    class="demo-dialog-backdrop landing-demo-request-backdrop"
    @click="onBackdropClick"
  >
    <div
      ref="dialog"
      class="demo-dialog landing-demo-request"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="submitted ? 'demo-request-thanks' : 'demo-request-title'"
      @keydown="onDialogKeydown"
    >
      <template v-if="submitted">
        <h3 id="demo-request-thanks">Request received</h3>
        <p class="author-list-sub demo-create-lead">
          Thanks — someone from AlertDriving will follow up soon.
        </p>
        <div class="demo-account-actions">
          <AuthorPillButton variant="white" @click="closeAndReset">Close</AuthorPillButton>
        </div>
      </template>

      <template v-else>
        <h3 id="demo-request-title">Request a demo</h3>
        <p class="author-list-sub demo-create-lead">
          Tell us a little about your team and we’ll reach out to schedule a walkthrough.
        </p>
        <form class="demo-form" novalidate @submit.prevent="submit">
          <label class="demo-field landing-demo-request-honeypot" aria-hidden="true">
            <span>Website</span>
            <input v-model="website" type="text" tabindex="-1" autocomplete="off" />
          </label>
          <label class="demo-field">
            <span>Full name</span>
            <input v-model="name" type="text" autocomplete="name" maxlength="120" required />
          </label>
          <label class="demo-field">
            <span>Work email</span>
            <input v-model="email" type="email" autocomplete="email" required />
          </label>
          <label class="demo-field">
            <span>Company</span>
            <input v-model="company" type="text" autocomplete="organization" maxlength="120" required />
          </label>
          <label class="demo-field">
            <span>Anything we should know? (optional)</span>
            <textarea v-model="message" rows="3" maxlength="500" />
          </label>
          <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
          <div class="demo-account-actions">
            <AuthorPillButton variant="white" :disabled="busy" @click="close">Cancel</AuthorPillButton>
            <button type="submit" class="author-pill author-pill-primary" :disabled="busy">
              {{ busy ? 'Sending…' : 'Submit request' }}
            </button>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>
