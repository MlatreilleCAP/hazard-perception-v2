<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

export type AuthorSelectOption = {
  value: string
  label: string
  subtext?: string
}

const props = defineProps<{
  id: string
  label: string
  placeholder?: string
  disabled?: boolean
  error?: string
  options: readonly AuthorSelectOption[]
}>()

const model = defineModel<string>({ required: true })

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const selectedOption = computed(
  () => props.options.find((option) => option.value === model.value) ?? null,
)

const displayText = computed(() => {
  if (selectedOption.value) return selectedOption.value.label
  return props.placeholder ?? 'Select'
})

const showPlaceholder = computed(() => !selectedOption.value)

function toggle(): void {
  if (props.disabled) return
  open.value = !open.value
}

function select(value: string): void {
  model.value = value
  open.value = false
}

function onDocPointerDown(event: PointerEvent): void {
  if (!open.value) return
  const el = root.value
  if (el && event.target instanceof Node && el.contains(event.target)) return
  open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointerDown))
</script>

<template>
  <div class="author-select-wrap">
    <label class="author-field author-select-field" :for="id">
      <span style="min-width: 0; flex: 1">
        <span class="author-field-label">{{ label }}</span>
        <div ref="root" class="author-select-control">
          <button
            :id="id"
            type="button"
            class="author-select-trigger"
            :disabled="disabled"
            :aria-expanded="open"
            aria-haspopup="listbox"
            @click="toggle"
          >
            <span
              class="author-select-value"
              :class="{ 'is-placeholder': showPlaceholder }"
            >
              {{ displayText }}
            </span>
            <svg
              class="author-select-chevron"
              :class="{ 'is-open': open }"
              viewBox="0 0 10 6"
              width="10"
              height="6"
              aria-hidden="true"
            >
              <path
                d="M1 1.5 5 4.5 9 1.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <div
            v-if="open"
            class="author-menu-panel author-select-menu"
            role="listbox"
            :aria-labelledby="id"
          >
            <button
              v-for="option in options"
              :key="option.value || '__empty__'"
              type="button"
              class="author-menu-item"
              :class="{ 'author-menu-item-stacked': Boolean(option.subtext) }"
              role="option"
              :aria-selected="option.value === model"
              @click="select(option.value)"
            >
              <span>{{ option.label }}</span>
              <span v-if="option.subtext" class="author-menu-item-subtext">{{
                option.subtext
              }}</span>
            </button>
          </div>
        </div>
      </span>
    </label>
    <p v-if="error" class="author-field-error">{{ error }}</p>
  </div>
</template>
