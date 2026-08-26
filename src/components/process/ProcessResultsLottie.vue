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

const emit = defineEmits<{
  /** Fires when one full playthrough finishes (or each loop when looping). */
  complete: []
}>()

const root = ref<HTMLDivElement | null>(null)
let animation: AnimationItem | null = null
let observer: ResizeObserver | null = null

function onCycleComplete(): void {
  emit('complete')
}

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
  animation.addEventListener('complete', onCycleComplete)
  animation.addEventListener('loopComplete', onCycleComplete)
  observer = new ResizeObserver(() => {
    animation?.resize()
  })
  observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  animation?.removeEventListener('complete', onCycleComplete)
  animation?.removeEventListener('loopComplete', onCycleComplete)
  animation?.destroy()
  animation = null
})
</script>

<template>
  <div ref="root" class="process-results-lottie" />
</template>
