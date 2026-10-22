<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ProcessSeverityPopover from '@/components/process/ProcessSeverityPopover.vue'
import ProcessTheoryPopover from '@/components/process/ProcessTheoryPopover.vue'
import type { ProcessSurveyQuestion } from '@/types/questions'

const props = defineProps<{
  questions: ProcessSurveyQuestion[]
}>()

const emit = defineEmits<{
  close: []
}>()

const FRAME_WIDTH = 1200
const MIN_ZOOM = 1
const MAX_ZOOM = 2.4
const ZOOM_STEP = 0.1

const index = ref(0)
const zoom = ref(1.6)
const sizerEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)
const current = computed(() => props.questions[index.value] ?? null)
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const positionLabel = computed(() => {
  if (props.questions.length === 0) return 'Question review'
  return `Question ${index.value + 1} of ${props.questions.length}`
})

let resizeObserver: ResizeObserver | null = null

function fitHeight(): void {
  const sizer = sizerEl.value
  const content = contentEl.value
  if (!sizer || !content) return
  sizer.style.height = `${Math.ceil(content.offsetHeight * zoom.value)}px`
}

function zoomBy(delta: number): void {
  const next = Math.round((zoom.value + delta) * 10) / 10
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
}

function close(): void {
  emit('close')
}

function onComplete(): void {
  if (index.value >= props.questions.length - 1) {
    close()
    return
  }
  index.value += 1
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
  if (contentEl.value) {
    resizeObserver = new ResizeObserver(() => fitHeight())
    resizeObserver.observe(contentEl.value)
  }
  fitHeight()
})

watch([zoom, index], () => {
  void nextTick(fitHeight)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  resizeObserver?.disconnect()
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div class="question-review" role="dialog" aria-modal="true" :aria-label="positionLabel">
      <header class="question-review-bar">
        <p class="question-review-count">{{ positionLabel }}</p>
        <div class="question-review-tools">
          <div class="question-review-zoom-controls" aria-label="Zoom">
            <button
              type="button"
              aria-label="Zoom out"
              :disabled="zoom <= MIN_ZOOM"
              @click="zoomBy(-ZOOM_STEP)"
            >
              −
            </button>
            <span>{{ zoomLabel }}</span>
            <button
              type="button"
              aria-label="Zoom in"
              :disabled="zoom >= MAX_ZOOM"
              @click="zoomBy(ZOOM_STEP)"
            >
              +
            </button>
          </div>
          <button type="button" class="question-review-close" @click="close">Close</button>
        </div>
      </header>
      <div class="question-review-stage">
        <p v-if="!current" class="question-review-empty">This section has no questions yet.</p>
        <div v-else class="question-review-frame">
          <div ref="sizerEl" class="question-review-sizer">
            <div
              class="process-experience question-review-experience"
              :style="{
                width: `${FRAME_WIDTH / zoom}px`,
                transform: `scale(${zoom})`,
              }"
            >
              <div ref="contentEl" class="process-dim-overlay">
                <ProcessSeverityPopover
                  v-if="current.kind === 'severity'"
                  :key="current.id"
                  :question="current"
                  @complete="onComplete"
                />
                <ProcessTheoryPopover
                  v-else
                  :key="current.id"
                  :question="current"
                  @complete="onComplete"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.question-review {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #403b3b;
}

.question-review-bar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 28px;
}

.question-review-count {
  margin: 0;
  font-family: var(--font-poppins, inherit);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.question-review-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.question-review-zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #403b3b;
  border-radius: 999px;
  padding: 4px;
}

.question-review-zoom-controls button {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #403b3b;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.question-review-zoom-controls button:hover:not(:disabled) {
  background: rgb(64 59 59 / 8%);
}

.question-review-zoom-controls button:disabled {
  opacity: 0.35;
  cursor: default;
}

.question-review-zoom-controls span {
  min-width: 52px;
  font-family: var(--font-poppins, inherit);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.question-review-close {
  min-height: 44px;
  border: 1px solid #403b3b;
  border-radius: 999px;
  background: #fff;
  padding: 10px 22px;
  font-family: var(--font-poppins, inherit);
  font-size: 16px;
  font-weight: 600;
  color: #403b3b;
  cursor: pointer;
}

.question-review-close:hover {
  background: #f7f7f7;
}

.question-review-stage {
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: flex-start;
  min-height: 0;
  overflow: hidden;
  padding: 0 24px 24px;
}

.question-review-empty {
  margin: auto;
  font-family: var(--font-poppins, inherit);
  font-size: 28px;
  font-weight: 500;
  color: #403b3b;
}

.question-review-frame {
  box-sizing: border-box;
  width: 1200px;
  max-width: 100%;
  max-height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  flex: none;
}

.question-review-sizer {
  width: 1200px;
  max-width: 100%;
  overflow: hidden;
}

.question-review-experience {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
  background: #fff !important;
  transform-origin: top left;
}

.question-review-experience > .process-dim-overlay {
  position: relative !important;
  inset: auto !important;
  width: 100%;
  height: auto !important;
  overflow: visible !important;
  padding: 72px 0 24px !important;
  background: #fff !important;
}

.question-review-experience .process-question-card {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin: 0;
  box-shadow: none;
}
</style>
