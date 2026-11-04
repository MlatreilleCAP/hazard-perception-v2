<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { formatDemoTimestamp } from '@/lib/demo/accessMessage'
import { demoFormError, displayDemoStatus, eventLabel, expiryIsoFromLocal } from '@/lib/demo/demoForm'
import { isSetupIncomplete } from '@/lib/demo/provisionState'
import {
  deactivateDemoAccount,
  deleteCreatedDemoUser,
  extendDemoAccount,
  listAdminOrganizations,
  listDemoAccountEvents,
  listDemoAccounts,
  provisionDemoAccount,
  type DemoAccountEventRecord,
  type DemoAccountRecord,
  type DemoOrganization,
} from '@/services/demoAccounts'

const props = withDefaults(defineProps<{
  reloadToken?: number
  showNewDemo?: boolean
  showIntro?: boolean
}>(), {
  showNewDemo: true,
  showIntro: true,
})

const toolbarReady = ref(false)

const emit = defineEmits<{
  lifecycleProfiles: [ids: string[]]
  changed: []
}>()

const organizations = ref<DemoOrganization[]>([])
const organizationId = ref('')
const accounts = ref<DemoAccountRecord[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const busy = ref(false)

const createOpen = ref(false)
const email = ref('')
const displayName = ref('')
const expiresAtLocal = ref('')
const dialogError = ref<string | null>(null)
const createDialog = ref<HTMLElement | null>(null)

const revealedPassword = ref<string | null>(null)
const deliveryNotice = ref<'accepted' | 'failed' | 'uncertain' | null>(null)
const passwordOpen = ref(false)
const passwordCopied = ref(false)
const copyBlocked = ref(false)
const passwordDialog = ref<HTMLElement | null>(null)

const incomplete = ref<{ email: string; displayName: string; expiresAtLocal: string } | null>(null)

const extendTarget = ref<DemoAccountRecord | null>(null)
const extendExpiry = ref('')
const extendError = ref<string | null>(null)
const extendDialog = ref<HTMLElement | null>(null)

const deactivateTarget = ref<DemoAccountRecord | null>(null)
const deactivateReason = ref('')
const deactivateError = ref<string | null>(null)
const deactivateDialog = ref<HTMLElement | null>(null)

const deleteTarget = ref<DemoAccountRecord | null>(null)
const deleteError = ref<string | null>(null)
const deleteDialog = ref<HTMLElement | null>(null)

const historyProfileId = ref<string | null>(null)
const history = ref<DemoAccountEventRecord[]>([])
const historyLoading = ref(false)
const historyError = ref<string | null>(null)

let returnFocus: HTMLElement | null = null

const blockingEmails = computed(() =>
  accounts.value
    .filter((account) => account.status !== 'setup_incomplete')
    .map((account) => account.email.toLowerCase()),
)

watch(accounts, (rows) => {
  emit('lifecycleProfiles', rows.map((account) => account.profileId).filter((id) => id.length > 0))
}, { immediate: true })

watch(() => props.reloadToken, () => {
  void load()
})

onMounted(() => {
  toolbarReady.value = document.getElementById('users-new-demo') != null
  void load()
})

async function refreshAfterChange(): Promise<void> {
  await load()
  if (!error.value) emit('changed')
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    organizations.value = await listAdminOrganizations()
    if (!organizationId.value || !organizations.value.some((organization) => organization.id === organizationId.value)) {
      organizationId.value = organizations.value[0]?.id ?? ''
    }
    accounts.value = organizationId.value ? await listDemoAccounts(organizationId.value) : []
  } catch (cause) {
    accounts.value = []
    error.value = cause instanceof Error ? cause.message : 'Demo accounts could not be loaded.'
  } finally {
    loading.value = false
  }
}

async function onOrganizationChange(): Promise<void> {
  historyProfileId.value = null
  history.value = []
  await load()
}

function rememberFocus(): void {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
}

function restoreFocus(): void {
  returnFocus?.focus()
  returnFocus = null
}

function onDialogKeydown(event: KeyboardEvent, root: HTMLElement | null): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeDialogs()
    return
  }
  if (event.key !== 'Tab' || !root) return
  const items = [...root.querySelectorAll<HTMLElement>('button, input, textarea, select')]
    .filter((item) => !item.hasAttribute('disabled'))
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

async function openCreate(prefill?: { email: string; displayName: string; expiresAtLocal: string }): Promise<void> {
  rememberFocus()
  email.value = prefill?.email ?? ''
  displayName.value = prefill?.displayName ?? ''
  expiresAtLocal.value = prefill?.expiresAtLocal ?? defaultExpiry()
  dialogError.value = null
  createOpen.value = true
  await nextTick()
  createDialog.value?.querySelector('input')?.focus()
}

function defaultExpiry(): string {
  const date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function closeDialogs(): void {
  createOpen.value = false
  extendTarget.value = null
  deactivateTarget.value = null
  deleteTarget.value = null
  clearPassword()
  restoreFocus()
}

function clearPassword(): void {
  revealedPassword.value = null
  deliveryNotice.value = null
  passwordOpen.value = false
  passwordCopied.value = false
  copyBlocked.value = false
}

async function submitCreate(): Promise<void> {
  dialogError.value = null
  const validation = demoFormError({
    email: email.value,
    displayName: displayName.value,
    expiresAtLocal: expiresAtLocal.value,
    existingEmails: blockingEmails.value,
  })
  if (validation) {
    dialogError.value = validation
    return
  }
  const expiresAt = expiryIsoFromLocal(expiresAtLocal.value)
  if (!expiresAt || !organizationId.value) {
    dialogError.value = 'Choose an expiry in the future.'
    return
  }
  busy.value = true
  const requestedEmail = email.value.trim().toLowerCase()
  const requestedName = displayName.value.trim()
  const requestedExpiry = expiresAtLocal.value
  try {
    const result = await provisionDemoAccount({
      email: requestedEmail,
      displayName: requestedName || null,
      organizationId: organizationId.value,
      expiresAt,
      emailSetup: true,
    })
    createOpen.value = false
    incomplete.value = null
    await refreshAfterChange()
    revealedPassword.value = result.initialPassword
    deliveryNotice.value = result.setupDelivery ?? null
    passwordCopied.value = false
    passwordOpen.value = true
    await nextTick()
    passwordDialog.value?.querySelector(result.initialPassword ? 'input' : 'button')?.focus()
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The demo account could not be created.'
    if (message.startsWith('This email already has a demo account')) {
      createOpen.value = false
      incomplete.value = null
      dialogError.value = null
      await refreshAfterChange()
      return
    }
    dialogError.value = message
    if (isSetupIncomplete(message)) {
      incomplete.value = {
        email: requestedEmail,
        displayName: requestedName,
        expiresAtLocal: requestedExpiry,
      }
    }
  } finally {
    busy.value = false
  }
}

async function copyPassword(): Promise<void> {
  const password = revealedPassword.value
  if (!password) return
  try {
    await navigator.clipboard.writeText(password)
    passwordCopied.value = true
    copyBlocked.value = false
  } catch {
    passwordCopied.value = false
    copyBlocked.value = true
    const field = passwordDialog.value?.querySelector('input')
    field?.focus()
    field?.select()
  }
}

function openExtend(account: DemoAccountRecord): void {
  rememberFocus()
  extendTarget.value = account
  extendExpiry.value = defaultExpiry()
  extendError.value = null
}

async function submitExtend(): Promise<void> {
  const account = extendTarget.value
  const expiresAt = expiryIsoFromLocal(extendExpiry.value)
  if (!account || !expiresAt) {
    extendError.value = 'Choose an expiry in the future.'
    return
  }
  busy.value = true
  extendError.value = null
  try {
    await extendDemoAccount(account.profileId, expiresAt)
    extendTarget.value = null
    restoreFocus()
    await refreshAfterChange()
    if (historyProfileId.value === account.profileId) await openHistory(account)
  } catch (cause) {
    extendError.value = cause instanceof Error ? cause.message : 'The demo account could not be extended.'
  } finally {
    busy.value = false
  }
}

function openDeactivate(account: DemoAccountRecord): void {
  rememberFocus()
  deactivateTarget.value = account
  deactivateReason.value = ''
  deactivateError.value = null
}

async function submitDeactivate(): Promise<void> {
  const account = deactivateTarget.value
  if (!account) return
  const reason = deactivateReason.value.trim()
  if (reason.length > 500) {
    deactivateError.value = 'The deactivation reason must be 500 characters or fewer.'
    return
  }
  busy.value = true
  deactivateError.value = null
  try {
    await deactivateDemoAccount(account.profileId, reason || null)
    deactivateTarget.value = null
    restoreFocus()
    await refreshAfterChange()
    if (historyProfileId.value === account.profileId) await openHistory(account)
  } catch (cause) {
    deactivateError.value = cause instanceof Error ? cause.message : 'The demo account could not be deactivated.'
  } finally {
    busy.value = false
  }
}

function openDelete(account: DemoAccountRecord): void {
  rememberFocus()
  deleteTarget.value = account
  deleteError.value = null
}

async function submitDelete(): Promise<void> {
  const account = deleteTarget.value
  if (!account) return
  busy.value = true
  deleteError.value = null
  try {
    await deleteCreatedDemoUser(account.profileId)
    if (historyProfileId.value === account.profileId) {
      historyProfileId.value = null
      history.value = []
    }
    deleteTarget.value = null
    restoreFocus()
    await refreshAfterChange()
  } catch (cause) {
    deleteError.value = cause instanceof Error ? cause.message : 'The user could not be deleted.'
  } finally {
    busy.value = false
  }
}

async function openHistory(account: DemoAccountRecord): Promise<void> {
  historyProfileId.value = account.profileId
  historyLoading.value = true
  historyError.value = null
  history.value = []
  try {
    history.value = await listDemoAccountEvents(organizationId.value, account.profileId)
  } catch (cause) {
    historyError.value = cause instanceof Error ? cause.message : 'History could not be loaded.'
  } finally {
    historyLoading.value = false
  }
}

function statusOf(account: DemoAccountRecord): string {
  return displayDemoStatus(account.status, account.expiresAt)
}

function formatDemoDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function accountSummary(account: DemoAccountRecord): string {
  const status = statusOf(account)
  const parts: string[] = []
  if (account.createdBy) parts.push(account.createdBy)
  parts.push(status)
  if (status === 'Setup incomplete') return parts.join(' · ')
  const start = formatDemoDate(account.startsAt)
  const end = formatDemoDate(account.expiresAt)
  if (start && end) parts.push(`${start} - ${end}`)
  return parts.join(' · ')
}

function retryHold(account: DemoAccountRecord): void {
  void openCreate({
    email: account.email,
    displayName: account.displayName ?? '',
    expiresAtLocal: defaultExpiry(),
  })
}
</script>

<template>
  <section class="demo-accounts" aria-label="Demo Accounts">
    <p v-if="showIntro" class="users-intro">
      Create a new demo user. Access starts immediately.
    </p>
    <AuthorPillButton
      v-if="showNewDemo && !toolbarReady"
      class="users-new-demo"
      variant="primary"
      :disabled="loading || busy || !organizationId"
      @click="openCreate()"
    >
      New Demo
    </AuthorPillButton>
    <Teleport v-if="showNewDemo && toolbarReady" to="#users-new-demo">
      <AuthorPillButton
        class="users-new-demo"
        variant="primary"
        :disabled="loading || busy || !organizationId"
        @click="openCreate()"
      >
        New Demo
      </AuthorPillButton>
    </Teleport>

    <label v-if="organizations.length > 1" class="demo-field">
      <span>Organization</span>
      <select v-model="organizationId" @change="onOrganizationChange">
        <option v-for="organization in organizations" :key="organization.id" :value="organization.id">
          {{ organization.name }}
        </option>
      </select>
    </label>

    <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="author-muted">Loading demo accounts…</p>
    <p v-else-if="!organizationId" class="author-muted">
      You are not a member of an organization, so demo accounts cannot be listed.
    </p>

    <div v-if="incomplete" class="demo-incomplete" role="status">
      <p class="author-list-title">Setup incomplete</p>
      <p class="author-list-sub">
        {{ incomplete.email }} was not finished. Retry does not show a password from the earlier attempt.
      </p>
      <AuthorPillButton variant="white" :disabled="busy" @click="openCreate(incomplete)">
        Retry
      </AuthorPillButton>
    </div>

    <p v-if="!loading && organizationId && accounts.length === 0 && !error" class="author-muted">
      No demo accounts yet.
    </p>

    <ul v-if="!loading && accounts.length > 0" class="users-list">
      <li v-for="account in accounts" :key="account.email" class="users-row demo-account-row">
        <div class="users-row-main">
          <p class="users-email">{{ account.email }}</p>
          <p class="author-list-sub">{{ accountSummary(account) }}</p>
        </div>
        <div class="demo-account-actions">
          <AuthorPillButton
            v-if="statusOf(account) === 'Setup incomplete'"
            variant="white"
            :disabled="busy"
            @click="retryHold(account)"
          >
            Retry
          </AuthorPillButton>
          <AuthorPillButton
            v-else
            variant="white"
            :disabled="busy || statusOf(account) === 'Deactivated'"
            @click="openDeactivate(account)"
          >
            Deactivate
          </AuthorPillButton>
          <AuthorPillButton
            v-if="statusOf(account) !== 'Setup incomplete' && statusOf(account) !== 'Deactivated'"
            variant="white"
            :disabled="busy"
            @click="openExtend(account)"
          >
            Extend
          </AuthorPillButton>
          <AuthorPillButton
            v-if="statusOf(account) !== 'Setup incomplete'"
            variant="white"
            @click="openHistory(account)"
          >
            History
          </AuthorPillButton>
          <AuthorPillButton variant="white" :disabled="busy" @click="openDelete(account)">
            Delete
          </AuthorPillButton>
        </div>
      </li>
    </ul>

    <section
      v-if="historyProfileId"
      class="demo-history"
      aria-labelledby="demo-history-title"
    >
      <h3 id="demo-history-title">History</h3>
      <p v-if="historyLoading" class="author-muted">Loading history…</p>
      <p v-else-if="historyError" class="auth-error" role="alert">{{ historyError }}</p>
      <p v-else-if="history.length === 0" class="author-muted">No lifecycle events yet.</p>
      <ul v-else class="demo-history-list">
        <li v-for="event in history" :key="event.id">
          <p class="author-list-title">{{ eventLabel(event.eventType) }}</p>
          <p class="author-list-sub">
            {{ formatDemoTimestamp(event.createdAt) }}
            · {{ event.actorEmail || 'System' }}
            <template v-if="event.reason"> · {{ event.reason }}</template>
          </p>
        </li>
      </ul>
    </section>

    <div v-if="createOpen" class="demo-dialog-backdrop">
      <div
        ref="createDialog"
        class="demo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-create-title"
        @keydown="onDialogKeydown($event, createDialog)"
      >
        <h3 id="demo-create-title">New demo</h3>
        <p class="author-list-sub demo-create-lead">
          The demo account will be created immediately. We'll email the user a secure link to create their password before accessing Inroads.
        </p>
        <form class="demo-form" novalidate @submit.prevent="submitCreate">
          <label class="demo-field">
            <span>Email address</span>
            <input v-model="email" type="email" autocomplete="off" required />
          </label>
          <label class="demo-field">
            <span>Display name (optional)</span>
            <input v-model="displayName" type="text" maxlength="80" autocomplete="off" />
          </label>
          <label class="demo-field">
            <span>Expiry</span>
            <input v-model="expiresAtLocal" type="datetime-local" required />
          </label>
          <p class="author-list-sub demo-create-note">Start is immediate. A future start cannot be chosen.</p>
          <p v-if="dialogError" class="auth-error" role="alert">{{ dialogError }}</p>
          <div class="demo-account-actions">
            <AuthorPillButton variant="white" :disabled="busy" @click="closeDialogs">Cancel</AuthorPillButton>
            <button type="submit" class="author-pill author-pill-primary" :disabled="busy">
              {{ busy ? 'Creating…' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="passwordOpen" class="demo-dialog-backdrop">
      <div
        ref="passwordDialog"
        class="demo-dialog demo-notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-password-title"
        @keydown="onDialogKeydown($event, passwordDialog)"
      >
        <h3 id="demo-password-title">{{ revealedPassword ? 'Initial password' : 'Demo account ready' }}</h3>
        <template v-if="revealedPassword">
          <p>
            Copy this password now and give it to the person securely.
            It will not be shown again.
          </p>
          <label class="demo-field">
            <span>Initial password</span>
            <input :value="revealedPassword" type="text" readonly spellcheck="false" autocomplete="off" />
          </label>
          <p v-if="passwordCopied" class="author-list-sub" role="status">Copied.</p>
          <p v-else-if="copyBlocked" class="author-list-sub" role="status">
            Copying is blocked in this browser. Select the password and copy it yourself.
          </p>
        </template>
        <p v-else-if="deliveryNotice === 'accepted'">
          The email provider accepted the account setup message. No password is shown.
          Acceptance does not confirm the mailbox received it.
        </p>
        <p v-else-if="deliveryNotice === 'uncertain'">
          Delivery could not be confirmed. The setup link was not sent again and no password is shown.
          Ask the person to use Forgot password on the sign-in page.
        </p>
        <p v-else-if="deliveryNotice === 'failed'">
          The email provider rejected the account setup message. It was not sent again and no password is shown.
          Ask the person to use Forgot password on the sign-in page.
        </p>
        <p v-else>
          The account is ready. A password from an earlier attempt cannot be shown.
          Use password reset if it was not saved.
        </p>
        <div class="demo-account-actions">
          <AuthorPillButton v-if="revealedPassword" variant="white" @click="copyPassword">
            Copy password
          </AuthorPillButton>
          <AuthorPillButton variant="white" @click="closeDialogs">Close</AuthorPillButton>
        </div>
      </div>
    </div>

    <div v-if="extendTarget" class="demo-dialog-backdrop">
      <div
        ref="extendDialog"
        class="demo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-extend-title"
        @keydown="onDialogKeydown($event, extendDialog)"
      >
        <h3 id="demo-extend-title">Extend {{ extendTarget.email }}</h3>
        <p class="author-list-sub">Choose a new expiry. Access continues from now if the demo had ended.</p>
        <form class="demo-form" novalidate @submit.prevent="submitExtend">
          <label class="demo-field">
            <span>New expiry</span>
            <input v-model="extendExpiry" type="datetime-local" required />
          </label>
          <p v-if="extendError" class="auth-error" role="alert">{{ extendError }}</p>
          <div class="demo-account-actions">
            <AuthorPillButton variant="white" :disabled="busy" @click="closeDialogs">Cancel</AuthorPillButton>
            <button type="submit" class="author-pill author-pill-primary" :disabled="busy">
              {{ busy ? 'Extending…' : 'Extend demo' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="deactivateTarget" class="demo-dialog-backdrop">
      <div
        ref="deactivateDialog"
        class="demo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-deactivate-title"
        @keydown="onDialogKeydown($event, deactivateDialog)"
      >
        <h3 id="demo-deactivate-title">Deactivate {{ deactivateTarget.email }}</h3>
        <p>This person will lose access. A deactivated demo stays off.</p>
        <form class="demo-form" novalidate @submit.prevent="submitDeactivate">
          <label class="demo-field">
            <span>Reason (optional)</span>
            <textarea v-model="deactivateReason" maxlength="500" rows="3" />
          </label>
          <p v-if="deactivateError" class="auth-error" role="alert">{{ deactivateError }}</p>
          <div class="demo-account-actions">
            <AuthorPillButton variant="white" :disabled="busy" @click="closeDialogs">Cancel</AuthorPillButton>
            <button type="submit" class="author-pill author-pill-primary" :disabled="busy">
              {{ busy ? 'Deactivating…' : 'Deactivate demo' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="deleteTarget" class="demo-dialog-backdrop">
      <div
        ref="deleteDialog"
        class="demo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-delete-title"
        @keydown="onDialogKeydown($event, deleteDialog)"
      >
        <h3 id="demo-delete-title">Delete {{ deleteTarget.email }}</h3>
        <p>
          This permanently removes the sign-in and the demo record.
          The email can be used again. This cannot be undone.
        </p>
        <p v-if="deleteError" class="auth-error" role="alert">{{ deleteError }}</p>
        <div class="demo-account-actions">
          <AuthorPillButton variant="white" :disabled="busy" @click="closeDialogs">Cancel</AuthorPillButton>
          <button type="button" class="author-pill author-pill-primary" :disabled="busy" @click="submitDelete">
            {{ busy ? 'Deleting…' : 'Delete user' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
