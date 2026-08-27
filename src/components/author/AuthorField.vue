<script setup lang="ts">
defineProps<{
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
</script>

<template>
  <div>
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
        <select
          v-else-if="options"
          :id="id"
          v-model="model"
          class="author-field-control"
          :disabled="disabled"
        >
          <option value="">{{ placeholder ?? 'Select' }}</option>
          <option v-for="option in options" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
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
