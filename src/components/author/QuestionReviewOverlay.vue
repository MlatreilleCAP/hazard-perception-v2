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

const DEFAULT_WIDTH = 1200
const MIN_WIDTH = 480
const WIDTH_STEP = 40
const MIN_ZOOM = 1
const MAX_ZOOM = 2.4
const ZOOM_STEP = 0.1

const index = ref(0)
const width = ref(DEFAULT_WIDTH)
const zoom = ref(1.6)
const resizing = ref(false)
const stageLimit = ref(DEFAULT_WIDTH)
const stageEl = ref<HTMLElement | null>(null)
const sizerEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)
const current = computed(() => props.questions[index.value] ?? null)
const widthLabel = computed(() => `${width.value}px`)
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

function measureStageLimit(): number {
  const stage = stageEl.value
  if (!stage) return DEFAULT_WIDTH
  const styles = getComputedStyle(stage)
  const pad = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
  return Math.max(MIN_WIDTH, Math.floor(stage.clientWidth - pad))
}

function setWidth(next: number): void {
  width.value = Math.round(Math.min(stageLimit.value, Math.max(MIN_WIDTH, next)))
}

function syncStageLimit(): void {
  stageLimit.value = measureStageLimit()
  setWidth(width.value)
}

function resizeBy(delta: number): void {
  setWidth(width.value + delta)
}

function zoomBy(delta: number): void {
  const next = Math.round((zoom.value + delta) * 10) / 10
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
}

let drag: { edge: 'left' | 'right'; startX: number; startWidth: number } | null = null

function onResizePointerDown(event: PointerEvent, edge: 'left' | 'right'): void {
  if (event.button !== 0) return
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  drag = { edge, startX: event.clientX, startWidth: width.value }
  resizing.value = true
}

function onResizePointerMove(event: PointerEvent): void {
  if (!drag) return
  const dx = event.clientX - drag.startX
  const delta = drag.edge === 'right' ? dx : -dx
  // The frame stays centered, so each edge moves half as far as the width changes.
  setWidth(drag.startWidth + delta * 2)
}

function onResizePointerUp(event: PointerEvent): void {
  if (!drag) return
  drag = null
  resizing.value = false
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
}

function onResizeKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    resizeBy(-WIDTH_STEP)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    resizeBy(WIDTH_STEP)
  }
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
  window.addEventListener('resize', syncStageLimit)
  document.body.style.overflow = 'hidden'
  syncStageLimit()
  if (contentEl.value) {
    resizeObserver = new ResizeObserver(() => fitHeight())
    resizeObserver.observe(contentEl.value)
  }
  fitHeight()
})

watch([zoom, index, width], () => {
  void nextTick(fitHeight)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', syncStageLimit)
  resizeObserver?.disconnect()
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      class="question-review"
      :class="{ 'is-resizing': resizing }"
      role="dialog"
      aria-modal="true"
      :aria-label="positionLabel"
    >
      <header class="question-review-bar">
        <p class="question-review-count">{{ positionLabel }}</p>
        <div class="question-review-tools">
          <div class="question-review-zoom-controls question-review-width-controls" aria-label="Width">
            <button
              type="button"
              aria-label="Narrower"
              :disabled="width <= MIN_WIDTH"
              @click="resizeBy(-WIDTH_STEP)"
            >
              −
            </button>
            <span>{{ widthLabel }}</span>
            <button
              type="button"
              aria-label="Wider"
              :disabled="width >= stageLimit"
              @click="resizeBy(WIDTH_STEP)"
            >
              +
            </button>
          </div>
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
      <div ref="stageEl" class="question-review-stage">
        <p v-if="!current" class="question-review-empty">This section has no questions yet.</p>
        <div v-else class="question-review-resizer" :style="{ width: `${width}px` }">
          <div
            class="question-review-resize is-left"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize question width"
            :aria-valuenow="width"
            :aria-valuemin="MIN_WIDTH"
            :aria-valuemax="stageLimit"
            :aria-valuetext="widthLabel"
            tabindex="0"
            @pointerdown="onResizePointerDown($event, 'left')"
            @pointermove="onResizePointerMove"
            @pointerup="onResizePointerUp"
            @pointercancel="onResizePointerUp"
            @keydown="onResizeKeydown"
          />
          <div class="question-review-frame">
          <div ref="sizerEl" class="question-review-sizer">
            <div
              class="process-experience question-review-experience"
              :style="{
                width: `${width / zoom}px`,
                transform: `scale(${zoom})`,
              }"
            >
              <div ref="contentEl" class="process-dim-overlay">
                <ProcessSeverityPopover
                  v-if="current.kind === 'severity'"
                  :key="current.id"
                  :question="current"
                  keyboard-nav
                  @complete="onComplete"
                />
                <ProcessTheoryPopover
                  v-else
                  :key="current.id"
                  :question="current"
                  keyboard-nav
                  @complete="onComplete"
                />
              </div>
            </div>
          </div>
          </div>
          <div
            class="question-review-resize is-right"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize question width"
            :aria-valuenow="width"
            :aria-valuemin="MIN_WIDTH"
            :aria-valuemax="stageLimit"
            :aria-valuetext="widthLabel"
            tabindex="0"
            @pointerdown="onResizePointerDown($event, 'right')"
            @pointermove="onResizePointerMove"
            @pointerup="onResizePointerUp"
            @pointercancel="onResizePointerUp"
            @keydown="onResizeKeydown"
          />
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

.question-review-width-controls span {
  min-width: 68px;
}

.question-review.is-resizing,
.question-review.is-resizing * {
  cursor: ew-resize !important;
  user-select: none;
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

.question-review-resizer {
  position: relative;
  flex: none;
  max-width: 100%;
  max-height: 100%;
  min-height: 0;
}

.question-review-frame {
  box-sizing: border-box;
  width: 100%;
  max-height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.question-review-resize {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 20px;
  touch-action: none;
  cursor: ew-resize;
}

.question-review-resize.is-left {
  left: -10px;
}

.question-review-resize.is-right {
  right: -10px;
}

.question-review-resize::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 72px;
  border-radius: 999px;
  background: #c4c0c0;
  transform: translate(-50%, -50%);
}

.question-review-resize:hover::before,
.question-review-resize:focus-visible::before {
  background: #403b3b;
}

.question-review-sizer {
  width: 100%;
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
