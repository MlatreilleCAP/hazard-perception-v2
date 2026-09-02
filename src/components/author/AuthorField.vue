<script setup lang="ts">
import { computed } from 'vue'
import AuthorSelectField from '@/components/author/AuthorSelectField.vue'

const props = defineProps<{
  id: string
  label: string
  error?: string
  multiline?: boolean
  rows?: number
  type?: 'text' | 'number'
  options?: readonly string[]
  placeholder?: string
  disabled?: boolean
}>()

const model = defineModel<string>({ required: true })

const selectOptions = computed(() => {
  if (!props.options) return []
  return [
    { value: '', label: props.placeholder ?? 'Select' },
    ...props.options.map((option) => ({ value: option, label: option })),
  ]
})
</script>

<template>
  <AuthorSelectField
    v-if="options"
    :id="id"
    v-model="model"
    :label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    :error="error"
    :options="selectOptions"
  />
  <div v-else>
    <label class="author-field" :for="id">
      <span style="min-width: 0; flex: 1">
        <span class="author-field-label">{{ label }}</span>
        <textarea
          v-if="multiline"
          :id="id"
          v-model="model"
          class="author-field-control"
          :rows="rows ?? 2"
          :placeholder="placeholder"
          :disabled="disabled"
        />
        <input
          v-else
          :id="id"
          v-model="model"
          class="author-field-control"
          :type="type ?? 'text'"
          :placeholder="placeholder"
          :disabled="disabled"
        />
      </span>
    </label>
    <p v-if="error" class="author-field-error">{{ error }}</p>
  </div>
</template>
