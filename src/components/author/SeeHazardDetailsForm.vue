<script setup lang="ts">
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import { CORE_COMPETENCIES, isCoreCompetency, type HazardDetails } from '@/types/hazard'

const props = defineProps<{
  hazardId: string
  modelValue: HazardDetails
}>()

const emit = defineEmits<{
  'update:modelValue': [value: HazardDetails]
}>()

function patch(next: Partial<HazardDetails>): void {
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
  </section>
</template>
