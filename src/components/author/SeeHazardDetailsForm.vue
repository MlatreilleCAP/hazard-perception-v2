<script setup lang="ts">
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import { CORE_COMPETENCIES, isCoreCompetency } from '@/types/hazard'
import type { SeeHazard } from '@/types/see'

const props = defineProps<{
  hazardId: string
  activityId: string
  modelValue: SeeHazard
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SeeHazard]
}>()

function patch(next: Partial<SeeHazard>): void {
  emit('update:modelValue', { ...props.modelValue, ...next })
}
</script>

<template>
  <section class="author-stack-sm">
    <AuthorSectionHeader title="Hazard Details" />
    <div class="see-details-grid">
      <AuthorField
        :id="`${hazardId}-name`"
        :model-value="modelValue.name"
        label="Hazard Name"
        placeholder="Hazard name goes here"
        @update:model-value="patch({ name: $event })"
      />
      <AuthorField
        :id="`${hazardId}-type`"
        :model-value="isCoreCompetency(modelValue.hazardType) ? modelValue.hazardType : ''"
        label="Core Competency"
        :options="CORE_COMPETENCIES"
        placeholder="Select a competency"
        @update:model-value="patch({ hazardType: $event })"
      />
    </div>
    <AuthorField
      :id="`${hazardId}-explanation`"
      :model-value="modelValue.explanation ?? ''"
      label="Hazard Explanation"
      placeholder="Explain the hazard to the learner"
      multiline
      :rows="3"
      @update:model-value="patch({ explanation: $event })"
    />
    <MediaUploadField
      :id="`${hazardId}-explanation-image`"
      :activity-id="activityId"
      label="Explanation image"
      kind="image"
      :model-value="modelValue.explanationImage ?? null"
      @update:model-value="patch({ explanationImage: $event })"
    />
  </section>
</template>
