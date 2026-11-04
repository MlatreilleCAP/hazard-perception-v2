<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import DemoAccountsSection from '@/components/author/DemoAccountsSection.vue'
import { GUARD_TOGGLE_REASON, isLifecycleRoleGuard, studioToggleReason } from '@/lib/demo/studioToggle'
import {
  listStudioPeople,
  setCanEditOthers,
  setStudioVisible,
  type StudioPerson,
} from '@/services/studioAccess'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const people = ref<StudioPerson[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const savingId = ref<string | null>(null)
const lifecycleProfileIds = ref(new Set<string>())
const guardBlocked = ref(new Set<string>())
const demoReload = ref(0)

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

onMounted(async () => {
  loading.value = true
  error.value = null
  try {
    people.value = await listStudioPeople()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load people'
  } finally {
    loading.value = false
  }
})

async function toggleStudio(person: StudioPerson): Promise<void> {
  if (toggleReason(person) || person.role === 'admin' || person.id === auth.userId || savingId.value) return
  const visible = person.role === 'demo'
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
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>People</h1>
          <p>
            Turn Studio off for people who should sign in and play, but not see Studio.
            Editors can be allowed to edit unpublished activities and stand alone videos created
            by other people. Published activities and stand alone videos stay locked, except for
            Steven Turney, Matt Latreille, and administrators.
          </p>
        </div>
      </div>

      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="author-muted">Loading people…</p>
      <p v-else-if="people.length === 0" class="author-muted">No accounts yet.</p>

      <ul v-else class="author-list">
        <li v-for="person in people" :key="person.id" class="author-list-row">
          <div style="min-width: 0; flex: 1">
            <p class="author-list-title">{{ person.email }}</p>
            <p v-if="person.displayName" class="author-list-sub">{{ person.displayName }}</p>
            <p
              v-if="toggleReason(person)"
              :id="`studio-lock-${person.id}`"
              class="author-list-sub"
            >
              {{ toggleReason(person) }}
            </p>
          </div>
          <p v-if="person.role === 'admin'" class="author-muted">Admin</p>
          <div v-else class="author-section-actions">
            <AuthorPillButton
              v-if="person.role === 'author'"
              variant="white"
              :disabled="savingId === person.id"
              @click="toggleEditOthers(person)"
            >
              {{ person.canEditOthers ? 'Can edit drafts' : 'Own drafts only' }}
            </AuthorPillButton>
            <AuthorPillButton
              variant="white"
              :disabled="Boolean(toggleReason(person)) || person.id === auth.userId || savingId === person.id"
              :aria-describedby="toggleReason(person) ? `studio-lock-${person.id}` : undefined"
              @click="toggleStudio(person)"
            >
              {{ person.role === 'demo' ? 'Studio off' : 'Studio on' }}
            </AuthorPillButton>
          </div>
        </li>
      </ul>

      <DemoAccountsSection :reload-token="demoReload" @lifecycle-profiles="onLifecycleProfiles" />
    </div>
  </div>
</template>
