<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import lottie, { type AnimationItem } from 'lottie-web'

const props = withDefaults(
  defineProps<{
    animationData: object
    loop?: boolean
    /** SVG preserveAspectRatio; use meet to span width without cropping. */
    preserveAspectRatio?: string
  }>(),
  {
    loop: false,
    preserveAspectRatio: 'xMidYMid meet',
  },
)

const root = ref<HTMLDivElement | null>(null)
let animation: AnimationItem | null = null
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!root.value) return
  animation = lottie.loadAnimation({
    container: root.value,
    renderer: 'svg',
    loop: props.loop,
    autoplay: true,
    animationData: props.animationData,
    rendererSettings: {
      preserveAspectRatio: props.preserveAspectRatio,
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
