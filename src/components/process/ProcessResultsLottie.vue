<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import lottie, { type AnimationItem } from 'lottie-web'

const props = defineProps<{
  animationData: object
}>()

const root = ref<HTMLDivElement | null>(null)
let animation: AnimationItem | null = null
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!root.value) return
  animation = lottie.loadAnimation({
    container: root.value,
    renderer: 'svg',
    loop: false,
    autoplay: true,
    animationData: props.animationData,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet',
    },
  })
  observer = new ResizeObserver(() => {
    animation?.resize()
  })
  observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  animation?.destroy()
  animation = null
})
</script>

<template>
  <div ref="root" class="process-results-lottie" />
</template>
