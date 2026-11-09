<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  id: string
  label: string
  options: readonly { value: string; label: string }[]
}>()

const model = defineModel<string>({ required: true })

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const selectedLabel = computed(
  () => props.options.find((option) => option.value === model.value)?.label ?? model.value,
)

function toggle(): void {
  open.value = !open.value
}

function choose(value: string): void {
  model.value = value
  open.value = false
}

function onPointerDown(event: PointerEvent): void {
  if (!open.value) return
  const el = root.value
  if (el && event.target instanceof Node && el.contains(event.target)) return
  open.value = false
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="demo-pill-select" :class="{ 'is-open': open }">
    <button
      :id="id"
      type="button"
      class="demo-pill-select-trigger"
      :aria-label="label"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      {{ selectedLabel }}
    </button>
    <div
      v-if="open"
      class="author-menu-panel author-select-menu"
      role="listbox"
      :aria-labelledby="id"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="author-menu-item"
        role="option"
        :aria-selected="option.value === model"
        @click="choose(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
