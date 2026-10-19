<script setup lang="ts">
import AuthorField from '@/components/author/AuthorField.vue'
import FieldPair from '@/components/author/FieldPair.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import MediaUploadField from '@/components/author/MediaUploadField.vue'
import type { SeeHazard } from '@/types/see'

const props = defineProps<{
  hazardId: string
  activityId: string
  modelValue: SeeHazard
  english?: SeeHazard | null
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
    <FieldPair
      :enabled="!!english"
      label="Hazard Explanation"
      :value="english?.explanation"
      multiline
    >
      <AuthorField
        :id="`${hazardId}-explanation`"
        :model-value="modelValue.explanation ?? ''"
        label="Hazard Explanation"
        placeholder="Explain the hazard to the learner"
        multiline
        :rows="3"
        @update:model-value="patch({ explanation: $event })"
      />
    </FieldPair>
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
