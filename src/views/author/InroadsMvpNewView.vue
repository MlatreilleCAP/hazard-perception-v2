<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createAnticipateActivity } from '@/activities/createAnticipateActivity'
import { createInroadsMvpActivity } from '@/activities/createInroadsMvpActivity'
import { createProcessActivity } from '@/activities/createProcessActivity'
import { createSeeActivity } from '@/activities/createSeeActivity'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import { useActivityStore } from '@/stores/activityStore'
import { INROADS_MVP_CHILD_TAG } from '@/types/inroadsMvp'

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
    const base = title.value.trim()

    const see = createSeeActivity(`${base} · Observe`)
    see.metadata.tags = [...see.metadata.tags, INROADS_MVP_CHILD_TAG]
    await activities.save(see)
    const seeId = activities.current?.id
    if (!seeId) throw new Error('Failed to create Observe section')

    const process = createProcessActivity(`${base} · Process`)
    process.metadata.tags = [...process.metadata.tags, INROADS_MVP_CHILD_TAG]
    await activities.save(process)
    const processId = activities.current?.id
    if (!processId) throw new Error('Failed to create Process section')

    const anticipate = createAnticipateActivity(`${base} · Anticipate`)
    anticipate.metadata.tags = [...anticipate.metadata.tags, INROADS_MVP_CHILD_TAG]
    await activities.save(anticipate)
    const anticipateId = activities.current?.id
    if (!anticipateId) throw new Error('Failed to create Anticipate section')

    const mvp = createInroadsMvpActivity(base, seeId, processId, anticipateId)
    mvp.metadata.description = description.value.trim()
    await activities.save(mvp)
    const id = activities.current?.id
    if (!id) throw new Error('Inroads MVP was created but could not be loaded')
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
