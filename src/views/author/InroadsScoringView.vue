<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSelectField from '@/components/author/AuthorSelectField.vue'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { getInroadsScoringPoints, loadInroadsScoring, saveInroadsScoring } from '@/services/inroadsScoring'
import {
  INROADS_SCORING_POINT_OPTIONS,
  INROADS_SCORING_SLOTS,
  inroadsScoringSectionLabel,
  type InroadsScoringPoints,
  type InroadsScoringSection,
  type InroadsScoringSlotId,
} from '@/types/inroadsScoring'

const { canCreate } = useStudioAccess()
const points = ref<InroadsScoringPoints>(getInroadsScoringPoints())
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const savedMessage = ref<string | null>(null)

const pointOptions = INROADS_SCORING_POINT_OPTIONS.map((value) => ({
  value: String(value),
  label: value === 1 ? '1 pt' : `${value} pts`,
}))

const groups = computed(() => {
  const sections: InroadsScoringSection[] = ['observe', 'process', 'anticipate']
  return sections.map((section) => ({
    section,
    title: inroadsScoringSectionLabel(section),
    slots: INROADS_SCORING_SLOTS.filter((slot) => slot.section === section),
  }))
})

onMounted(async () => {
  loading.value = true
  error.value = null
  try {
    points.value = await loadInroadsScoring()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load scoring'
  } finally {
    loading.value = false
  }
})

async function setSlotPoints(id: InroadsScoringSlotId, value: string): Promise<void> {
  const next = { ...points.value, [id]: Number.parseInt(value, 10) }
  points.value = next
  saving.value = true
  savedMessage.value = null
  error.value = null
  try {
    points.value = await saveInroadsScoring(next)
    savedMessage.value = 'Saved. These points apply to every Inroads lesson.'
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? `${cause.message} Points were saved on this device.`
        : 'Failed to save scoring'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>Inroads Scoring</h1>
          <p>
            Set points for each Inroads question type. The same values are used for every Inroads
            lesson.
          </p>
        </div>
        <AuthorPillButton v-if="saving" variant="white" disabled>Saving…</AuthorPillButton>
      </div>

      <p v-if="error" class="author-error">{{ error }}</p>
      <p v-else-if="savedMessage" class="author-muted">{{ savedMessage }}</p>
      <p v-if="loading" class="author-muted">Loading scoring…</p>

      <section
        v-for="group in groups"
        :key="group.section"
        class="author-list-card"
        style="padding: 20px 24px"
      >
        <h2 style="margin: 0 0 16px; font-size: 15px; font-weight: 600">{{ group.title }}</h2>
        <div class="author-stack-sm">
          <AuthorSelectField
            v-for="slot in group.slots"
            :id="`inroads-scoring-${slot.id}`"
            :key="slot.id"
            :model-value="String(points[slot.id])"
            :label="slot.label"
            :options="pointOptions"
            :disabled="!canCreate || loading"
            @update:model-value="setSlotPoints(slot.id, $event)"
          />
        </div>
      </section>
    </div>
  </div>
</template>
