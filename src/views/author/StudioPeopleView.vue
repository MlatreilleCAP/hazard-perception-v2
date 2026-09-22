<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { listStudioPeople, setStudioVisible, type StudioPerson } from '@/services/studioAccess'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const people = ref<StudioPerson[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const savingId = ref<string | null>(null)

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
  if (person.role === 'admin' || person.id === auth.userId || savingId.value) return
  const visible = person.role === 'demo'
  savingId.value = person.id
  error.value = null
  try {
    await setStudioVisible(person.id, visible)
    person.role = visible ? 'author' : 'demo'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to update Studio access'
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
            Turn Studio off for people who should sign in and play lessons, but not see Studio.
            Admins always keep Studio.
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
          </div>
          <p v-if="person.role === 'admin'" class="author-muted">Admin</p>
          <AuthorPillButton
            v-else
            variant="white"
            :disabled="person.id === auth.userId || savingId === person.id"
            @click="toggleStudio(person)"
          >
            {{ person.role === 'demo' ? 'Studio off' : 'Studio on' }}
          </AuthorPillButton>
        </li>
      </ul>
    </div>
  </div>
</template>
