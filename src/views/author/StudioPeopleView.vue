<script setup lang="ts">
import { onMounted, ref } from 'vue'
import DemoAccountsSection from '@/components/author/DemoAccountsSection.vue'
import { GUARD_TOGGLE_REASON, isLifecycleRoleGuard, studioToggleReason } from '@/lib/demo/studioToggle'
import { deleteCreatedDemoUser, createSystemUser, listAdminOrganizations, type DemoOrganization } from '@/services/demoAccounts'
import {
  listStudioPeople,
  setCanEditOthers,
  setProfileRole,
  setStudioVisible,
  type StudioPerson,
} from '@/services/studioAccess'
import { useAuthStore } from '@/stores/authStore'

type UsersTab = 'demo' | 'system'

const auth = useAuthStore()
const activeTab = ref<UsersTab>('demo')
const people = ref<StudioPerson[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const savingId = ref<string | null>(null)
const deleteTarget = ref<StudioPerson | null>(null)
const deleteError = ref<string | null>(null)
const lifecycleProfileIds = ref(new Set<string>())
const guardBlocked = ref(new Set<string>())
const demoReload = ref(0)
const createOpen = ref(false)
const createEmail = ref('')
const createName = ref('')
const createRole = ref<'author' | 'sales'>('author')
const createError = ref<string | null>(null)
const createNotice = ref<string | null>(null)
const creating = ref(false)
const organizations = ref<DemoOrganization[]>([])
const organizationId = ref('')

function onLifecycleProfiles(ids: string[]): void {
  lifecycleProfileIds.value = new Set(ids)
  const nextGuards = new Set(guardBlocked.value)
  for (const id of ids) nextGuards.delete(id)
  guardBlocked.value = nextGuards
}

function toggleReason(person: StudioPerson): string | null {
  return studioToggleReason({
    role: person.role,
    profileId: person.id,
    lifecycleProfileIds: lifecycleProfileIds.value,
    guardBlocked: guardBlocked.value.has(person.id),
  })
}

async function reloadPeople(showLoading: boolean): Promise<void> {
  if (showLoading) loading.value = true
  error.value = null
  try {
    people.value = await listStudioPeople()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load people'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (auth.isSales) {
    loading.value = false
    return
  }
  void reloadPeople(true)
})

async function onDemoAccountsChanged(): Promise<void> {
  if (auth.isSales) return
  await reloadPeople(false)
}

function switchLocked(person: StudioPerson): boolean {
  return Boolean(toggleReason(person)) || person.role === 'admin' || person.id === auth.userId || savingId.value === person.id
}

async function toggleSales(person: StudioPerson): Promise<void> {
  if (switchLocked(person) || savingId.value) return
  const enable = person.role !== 'sales'
  savingId.value = person.id
  error.value = null
  try {
    await setProfileRole(person.id, enable ? 'sales' : 'author')
    person.role = enable ? 'sales' : 'author'
    if (enable) person.canEditOthers = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to update Sales access'
  } finally {
    savingId.value = null
  }
}

async function toggleDemo(person: StudioPerson): Promise<void> {
  if (switchLocked(person) || person.role === 'unprovisioned' || savingId.value) return
  const enable = person.role !== 'demo'
  savingId.value = person.id
  error.value = null
  try {
    await setStudioVisible(person.id, !enable)
    person.role = enable ? 'demo' : 'author'
    if (enable) person.canEditOthers = false
    guardBlocked.value.delete(person.id)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Failed to update Studio access'
    if (isLifecycleRoleGuard(message)) {
      guardBlocked.value = new Set(guardBlocked.value).add(person.id)
      error.value = GUARD_TOGGLE_REASON
      demoReload.value += 1
      return
    }
    error.value = /sqlstate|duplicate key|violates/i.test(message)
      ? 'Studio access could not be changed.'
      : message
  } finally {
    savingId.value = null
  }
}
async function toggleStudio(person: StudioPerson): Promise<void> {
  if (toggleReason(person) || person.role === 'admin' || person.id === auth.userId || savingId.value) return
  const visible = person.role === 'demo' || person.role === 'unprovisioned' || person.role === 'sales'
  savingId.value = person.id
  error.value = null
  try {
    await setStudioVisible(person.id, visible)
    person.role = visible ? 'author' : 'demo'
    if (!visible) person.canEditOthers = false
    guardBlocked.value.delete(person.id)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Failed to update Studio access'
    if (isLifecycleRoleGuard(message)) {
      guardBlocked.value = new Set(guardBlocked.value).add(person.id)
      error.value = GUARD_TOGGLE_REASON
      demoReload.value += 1
      return
    }
    error.value = /sqlstate|duplicate key|violates/i.test(message)
      ? 'Studio access could not be changed.'
      : message
  } finally {
    savingId.value = null
  }
}

function canDelete(person: StudioPerson): boolean {
  return person.role !== 'admin' && person.id !== auth.userId
}

function openDelete(person: StudioPerson): void {
  if (!canDelete(person) || savingId.value) return
  deleteTarget.value = person
  deleteError.value = null
}

async function confirmDelete(): Promise<void> {
  const person = deleteTarget.value
  if (!person || savingId.value) return
  savingId.value = person.id
  deleteError.value = null
  try {
    await deleteCreatedDemoUser(person.id)
    deleteTarget.value = null
    demoReload.value += 1
    await reloadPeople(false)
  } catch (cause) {
    deleteError.value = cause instanceof Error ? cause.message : 'The user could not be deleted.'
  } finally {
    savingId.value = null
  }
}

async function openCreateUser(): Promise<void> {
  createError.value = null
  createNotice.value = null
  createEmail.value = ''
  createName.value = ''
  createRole.value = 'author'
  creating.value = false
  try {
    organizations.value = await listAdminOrganizations()
    organizationId.value = organizations.value[0]?.id ?? ''
    if (!organizationId.value) {
      createError.value = 'You are not a member of an organization, so a system user cannot be added.'
    }
  } catch (cause) {
    organizations.value = []
    organizationId.value = ''
    createError.value = cause instanceof Error ? cause.message : 'Organizations could not be loaded.'
  }
  createOpen.value = true
}

function closeCreateUser(): void {
  if (creating.value) return
  createOpen.value = false
}

async function submitCreateUser(): Promise<void> {
  createError.value = null
  const email = createEmail.value.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    createError.value = 'Enter an email address.'
    return
  }
  if (!organizationId.value) {
    createError.value = 'You are not a member of an organization, so a system user cannot be added.'
    return
  }
  creating.value = true
  try {
    const result = await createSystemUser({
      email,
      displayName: createName.value.trim() || null,
      organizationId: organizationId.value,
      role: createRole.value,
    })
    createOpen.value = false
    await reloadPeople(false)
    createNotice.value = result.setupDelivery === 'accepted'
      ? 'The user was created. We emailed a link to set a password.'
      : 'The user was created, but the setup email could not be sent.'
  } catch (cause) {
    createError.value = cause instanceof Error ? cause.message : 'The system user could not be created.'
  } finally {
    creating.value = false
  }
}

async function toggleEditOthers(person: StudioPerson): Promise<void> {
  if (person.role !== 'author' || savingId.value) return
  const allowed = !person.canEditOthers
  savingId.value = person.id
  error.value = null
  try {
    await setCanEditOthers(person.id, allowed)
    person.canEditOthers = allowed
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to update draft editing'
  } finally {
    savingId.value = null
  }
}
</script>

<template>
  <div class="author-page users-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>{{ auth.isSales ? 'Demo Accounts' : 'Users' }}</h1>
        </div>
      </div>

      <div v-if="!auth.isSales" class="users-toolbar">
        <nav class="mvp-section-nav" aria-label="Users">
          <button
            type="button"
            class="mvp-section-tab"
            :class="{ active: activeTab === 'demo' }"
            :aria-pressed="activeTab === 'demo'"
            @click="activeTab = 'demo'"
          >
            Demo Accounts
          </button>
          <button
            type="button"
            class="mvp-section-tab"
            :class="{ active: activeTab === 'system' }"
            :aria-pressed="activeTab === 'system'"
            @click="activeTab = 'system'"
          >
            System Users
          </button>
        </nav>
        <div id="users-new-demo" class="users-toolbar-action">
          <button
            v-if="activeTab === 'system'"
            type="button"
            class="author-pill author-pill-primary"
            @click="openCreateUser"
          >
            New user
          </button>
        </div>
      </div>

      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>

      <DemoAccountsSection
        v-show="auth.isSales || activeTab === 'demo'"
        :reload-token="demoReload"
        :show-new-demo="auth.isSales || activeTab === 'demo'"
        @lifecycle-profiles="onLifecycleProfiles"
        @changed="onDemoAccountsChanged"
      />

      <div v-if="!auth.isSales" v-show="activeTab === 'system'" class="system-users">
        <p class="users-intro">
          Turn Studio off for people who should sign in and play, but not see Studio.
          Sales can open Demo Accounts only.
          Editors can be allowed to edit unpublished activities and stand alone videos created
          by other people. Published activities and stand alone videos stay locked, except for
          Steven Turney, Matt Latreille, and administrators.
        </p>
        <p v-if="createNotice" class="author-list-sub" role="status">{{ createNotice }}</p>
        <p v-if="loading" class="author-muted">Loading people…</p>
        <p v-else-if="people.length === 0" class="author-muted">No accounts yet.</p>

        <ul v-else class="users-list">
          <li v-for="person in people" :key="person.id" class="users-row">
            <div class="users-row-main">
              <p class="users-email">{{ person.email }}</p>
              <p
                v-if="toggleReason(person)"
                :id="`studio-lock-${person.id}`"
                class="author-list-sub"
              >
                {{ toggleReason(person) }}
              </p>
            </div>
            <div class="users-actions">
              <div class="users-switches">
              <button
                type="button"
                class="users-switch"
                role="switch"
                :aria-checked="person.role === 'demo'"
                :disabled="switchLocked(person) || person.role === 'unprovisioned'"
                @click="toggleDemo(person)"
              >
                <span>Demo</span>
                <span class="author-switch" :class="{ on: person.role === 'demo' }" aria-hidden="true">
                  <span class="author-switch-knob" />
                </span>
              </button>
              <button
                type="button"
                class="users-switch"
                role="switch"
                :aria-checked="person.canEditOthers"
                :disabled="person.role !== 'author' || savingId === person.id"
                @click="toggleEditOthers(person)"
              >
                <span>Edit</span>
                <span class="author-switch" :class="{ on: person.canEditOthers && person.role === 'author' }" aria-hidden="true">
                  <span class="author-switch-knob" />
                </span>
              </button>
              <button
                type="button"
                class="users-switch"
                role="switch"
                :aria-checked="person.role === 'sales'"
                :disabled="switchLocked(person)"
                @click="toggleSales(person)"
              >
                <span>Sales</span>
                <span class="author-switch" :class="{ on: person.role === 'sales' }" aria-hidden="true">
                  <span class="author-switch-knob" />
                </span>
              </button>
              <button
                type="button"
                class="users-switch"
                role="switch"
                :aria-checked="person.role === 'author' || person.role === 'admin'"
                :aria-describedby="toggleReason(person) ? `studio-lock-${person.id}` : undefined"
                :disabled="switchLocked(person)"
                @click="toggleStudio(person)"
              >
                <span>Studio</span>
                <span class="author-switch" :class="{ on: person.role === 'author' || person.role === 'admin' }" aria-hidden="true">
                  <span class="author-switch-knob" />
                </span>
              </button>
              </div>
              <button
                v-if="canDelete(person)"
                type="button"
                class="author-pill users-delete"
                :disabled="savingId === person.id"
                @click="openDelete(person)"
              >
                Delete
              </button>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="deleteTarget" class="demo-dialog-backdrop">
        <div
          class="demo-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="system-delete-title"
        >
          <h3 id="system-delete-title">Delete {{ deleteTarget.email }}</h3>
          <p>
            This permanently removes the sign-in.
            The email can be used again for a demo account. This cannot be undone.
          </p>
          <p v-if="deleteError" class="auth-error" role="alert">{{ deleteError }}</p>
          <div class="demo-account-actions">
            <button type="button" class="author-pill" :disabled="savingId === deleteTarget.id" @click="deleteTarget = null">
              Cancel
            </button>
            <button type="button" class="author-pill" :disabled="savingId === deleteTarget.id" @click="confirmDelete">
              {{ savingId === deleteTarget.id ? 'Deleting…' : 'Delete user' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="createOpen" class="demo-dialog-backdrop">
        <div class="demo-dialog" role="dialog" aria-modal="true" aria-labelledby="system-create-title">
          <h3 id="system-create-title">New user</h3>
          <p class="author-list-sub">
            The account is created immediately. We email a link so they can set a password.
          </p>
          <form class="demo-form" novalidate @submit.prevent="submitCreateUser">
            <label class="demo-field">
              <span>Email address</span>
              <input v-model="createEmail" type="email" autocomplete="off" required />
            </label>
            <label class="demo-field">
              <span>Display name (optional)</span>
              <input v-model="createName" type="text" maxlength="80" autocomplete="off" />
            </label>
            <label v-if="organizations.length > 1" class="demo-field">
              <span>Organization</span>
              <select v-model="organizationId">
                <option v-for="organization in organizations" :key="organization.id" :value="organization.id">
                  {{ organization.name }}
                </option>
              </select>
            </label>
            <label class="demo-field">
              <span>Role</span>
              <select v-model="createRole">
                <option value="author">Author</option>
                <option value="sales">Sales</option>
              </select>
            </label>
            <p v-if="createError" class="auth-error" role="alert">{{ createError }}</p>
            <div class="demo-account-actions">
              <button type="button" class="author-pill" :disabled="creating" @click="closeCreateUser">
                Cancel
              </button>
              <button type="submit" class="author-pill author-pill-primary" :disabled="creating || !organizationId">
                {{ creating ? 'Creating…' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
