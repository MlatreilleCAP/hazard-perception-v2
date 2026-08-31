<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import { createBlankInroadsMvp } from '@/services/createInroadsMvp'
import { useActivityStore } from '@/stores/activityStore'

const router = useRouter()
const activities = useActivityStore()
const title = ref('')
const description = ref('')
const titleError = ref<string | null>(null)
const saving = ref(false)

async function create(): Promise<void> {
  titleError.value = title.value.trim() ? null : 'Title is required'
  if (titleError.value) return

  saving.value = true
  try {
    const id = await createBlankInroadsMvp(title.value.trim(), description.value.trim())
    await activities.refreshList()
    await router.push(`/studio/inroads-mvp/${id}`)
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to create Inroads MVP')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack">
      <div class="author-header-row">
        <div class="author-header-left">
          <RouterLink to="/studio/inroads-mvp" class="author-back" aria-label="Back">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path
                d="M10 3.5 5.5 8 10 12.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </RouterLink>
          <h1 class="author-header-title">New Inroads MVP</h1>
        </div>
      </div>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Lesson Info" />
        <AuthorField
          id="mvp-title"
          v-model="title"
          label="Title"
          :error="titleError ?? undefined"
          placeholder="Inroads MVP title"
        />
        <AuthorField
          id="mvp-description"
          v-model="description"
          label="Description"
          multiline
          :rows="3"
          placeholder="What learners will cover"
        />
      </section>

      <p class="author-muted">
        Creates four sections: Intro video, Observe, Process, and Anticipate. Observe,
        Process, and Anticipate start as full authoring pages nested in this lesson.
      </p>

      <div class="author-actions">
        <AuthorPillButton variant="primary" :disabled="saving" @click="create">
          {{ saving ? 'Creating…' : 'Create' }}
        </AuthorPillButton>
      </div>
    </div>
  </div>
</template>
