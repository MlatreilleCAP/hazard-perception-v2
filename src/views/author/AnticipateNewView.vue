<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createAnticipateActivity } from '@/activities/createAnticipateActivity'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import { useActivityStore } from '@/stores/activityStore'
import {
  ANTICIPATE_TEMPLATES,
  FREEZE_FRAME_BRANCH_TEMPLATE_ID,
  isLiveAnticipateTemplateId,
  type AnticipateLiveTemplateId,
} from '@/types/anticipate'

const router = useRouter()
const activities = useActivityStore()
const title = ref('')
const description = ref('')
const titleError = ref<string | null>(null)
const templateError = ref<string | null>(null)
const selectedTemplateId = ref<AnticipateLiveTemplateId | null>(
  FREEZE_FRAME_BRANCH_TEMPLATE_ID,
)
const saving = ref(false)

function selectTemplate(id: string, comingSoon: boolean): void {
  if (comingSoon || !isLiveAnticipateTemplateId(id)) return
  selectedTemplateId.value = id
  templateError.value = null
}

async function create(): Promise<void> {
  titleError.value = title.value.trim() ? null : 'Title is required'
  templateError.value = selectedTemplateId.value
    ? null
    : 'Choose a template to continue'
  if (titleError.value || templateError.value || !selectedTemplateId.value) return

  saving.value = true
  try {
    const definition = createAnticipateActivity(
      title.value.trim(),
      selectedTemplateId.value,
    )
    definition.metadata.description = description.value.trim()
    await activities.save(definition)
    const id = activities.current?.id
    if (!id) {
      throw new Error('Anticipate was created but could not be loaded')
    }
    await router.push(`/studio/anticipate/${id}`)
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to create anticipate')
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
          <RouterLink to="/studio/anticipate" class="author-back" aria-label="Back">
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
          <h1 class="author-header-title">New Anticipate</h1>
        </div>
      </div>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Hazard Info" />
        <AuthorField id="title" v-model="title" label="Title" :error="titleError ?? undefined" />
        <AuthorField
          id="description"
          v-model="description"
          label="Description"
          multiline
          :rows="1"
        />
      </section>

      <section class="author-stack-sm">
        <AuthorSectionHeader title="Template" />
        <p class="author-muted">Choose how this Anticipate scenario behaves.</p>
        <p v-if="templateError" class="author-error">{{ templateError }}</p>
        <div class="anticipate-template-grid">
          <button
            v-for="template in ANTICIPATE_TEMPLATES"
            :key="template.id"
            type="button"
            class="anticipate-template-card"
            :class="{
              selected: selectedTemplateId === template.id,
              disabled: template.comingSoon,
            }"
            :disabled="template.comingSoon"
            @click="selectTemplate(template.id, template.comingSoon)"
          >
            <div class="anticipate-template-card-top">
              <strong>{{ template.label }}</strong>
              <span v-if="template.comingSoon" class="anticipate-template-soon">Coming soon</span>
            </div>
            <p>{{ template.description }}</p>
          </button>
        </div>
      </section>

      <div class="author-actions">
        <AuthorPillButton variant="primary" :disabled="saving" @click="create">
          {{ saving ? 'Creating…' : 'Create' }}
        </AuthorPillButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.anticipate-template-grid {
  display: grid;
  gap: 12px;
}

@media (min-width: 720px) {
  .anticipate-template-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.anticipate-template-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  padding: 14px 16px;
  border: 1px solid var(--author-border, #d8d8d8);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  color: inherit;
}

.anticipate-template-card.selected {
  border-color: #111;
  box-shadow: inset 0 0 0 1px #111;
}

.anticipate-template-card.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.anticipate-template-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.anticipate-template-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: #666;
}

.anticipate-template-soon {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #888;
}
</style>
