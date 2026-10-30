<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import availableIcon from '@/assets/queue/available.svg'
import inProgressIcon from '@/assets/queue/in-progress.svg'
import reviewIcon from '@/assets/queue/review.svg'
import { services } from '@/app/container'
import { useQueueIdentity } from '@/composables/useQueueIdentity'
import {
  APPROVER_NAME,
  MANAGING_EDITOR_NAME,
} from '@/lib/lesson/queueAssignment'
import { setLessonQueuePlacement } from '@/services/publishInroadsMvp'
import { useActivityStore } from '@/stores/activityStore'
import {
  isInroadsMvpActivity,
  lessonQueueStatus,
  type LessonReviewStatus,
} from '@/types/inroadsMvp'

const activities = useActivityStore()
const identity = useQueueIdentity()

type QueueCard = {
  id: string
  title: string
  country: string
  language: string
  status: LessonReviewStatus
  assigneeId: string
  assigneeName: string
}

type BoardStatus = 'available' | 'in_progress' | 'review' | 'approval'

const BOARD: Array<{
  status: BoardStatus
  label: string
  icon: string
  action: 'Claim' | 'Submit' | 'Approve'
}> = [
  { status: 'available', label: 'Available', icon: availableIcon, action: 'Claim' },
  { status: 'in_progress', label: 'In Progress', icon: inProgressIcon, action: 'Submit' },
  { status: 'review', label: 'Review', icon: reviewIcon, action: 'Submit' },
  { status: 'approval', label: 'Approval', icon: reviewIcon, action: 'Approve' },
]

const cards = ref<QueueCard[]>([])
const loading = ref(true)
const updatingId = ref<string | null>(null)
const draggingId = ref<string | null>(null)
const dropStatus = ref<BoardStatus | null>(null)
const actionError = ref<string | null>(null)

function localeLabel(card: QueueCard): string {
  const parts = [card.country, card.language].filter(Boolean)
  return parts.join(' - ') || 'Language not set'
}

function cardsFor(status: QueueCard['status']): QueueCard[] {
  return cards.value.filter((card) => card.status === status)
}

function holderName(card: QueueCard): string {
  if (card.status === 'review') return MANAGING_EDITOR_NAME
  if (card.status === 'approval') return APPROVER_NAME
  return card.assigneeName
}

function canAct(card: QueueCard): boolean {
  if (updatingId.value) return false
  if (card.status === 'available') return true
  if (card.status === 'in_progress') {
    return !card.assigneeId || card.assigneeId === identity.userId.value
  }
  if (card.status === 'review') return identity.canReview.value
  if (card.status === 'approval') return identity.canApprove.value
  return false
}

function actionTitle(card: QueueCard): string | undefined {
  if (canAct(card)) return undefined
  if (card.status === 'in_progress') return 'Only the person who claimed this lesson can submit it'
  if (card.status === 'review') return `${MANAGING_EDITOR_NAME} reviews these lessons`
  if (card.status === 'approval') return `${APPROVER_NAME} approves these lessons`
  return undefined
}

function placementFor(status: BoardStatus | 'approved'): { id: string; name: string } | null {
  if (status === 'in_progress') {
    return { id: identity.userId.value ?? '', name: identity.name.value || 'Unassigned' }
  }
  if (status === 'review') return { id: '', name: MANAGING_EDITOR_NAME }
  if (status === 'approval' || status === 'approved') {
    return { id: identity.userId.value ?? '', name: APPROVER_NAME }
  }
  return null
}

function sortCards(items: QueueCard[]): QueueCard[] {
  return [...items].sort((left, right) => left.title.localeCompare(right.title))
}

async function moveCard(id: string, status: BoardStatus | 'approved'): Promise<void> {
  const previous = cards.value.find((item) => item.id === id)
  if (!previous || previous.status === status || updatingId.value) return
  updatingId.value = id
  actionError.value = null
  const assignee = placementFor(status)
  const without = cards.value.filter((item) => item.id !== id)
  cards.value =
    status === 'approved'
      ? without
      : sortCards([
          ...without,
          {
            ...previous,
            status,
            assigneeId: assignee?.id ?? '',
            assigneeName: assignee?.name ?? '',
          },
        ])
  try {
    await setLessonQueuePlacement(id, status, assignee)
  } catch (cause) {
    cards.value = sortCards([...cards.value.filter((item) => item.id !== id), previous])
    actionError.value = cause instanceof Error ? cause.message : 'Failed to update the lesson'
  } finally {
    updatingId.value = null
  }
}

function onDragStart(card: QueueCard, event: DragEvent): void {
  if (updatingId.value) {
    event.preventDefault()
    return
  }
  draggingId.value = card.id
  event.dataTransfer?.setData('text/plain', card.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragEnd(): void {
  draggingId.value = null
  dropStatus.value = null
}

function onDragOver(status: BoardStatus, event: DragEvent): void {
  const card = cards.value.find((item) => item.id === draggingId.value)
  if (!card || card.status === status) return
  event.preventDefault()
  dropStatus.value = status
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onDragLeave(status: BoardStatus, event: DragEvent): void {
  const current = event.currentTarget
  const next = event.relatedTarget
  if (current instanceof Node && next instanceof Node && current.contains(next)) return
  if (dropStatus.value === status) dropStatus.value = null
}

function onDrop(status: BoardStatus, event: DragEvent): void {
  event.preventDefault()
  const id = event.dataTransfer?.getData('text/plain') || draggingId.value
  draggingId.value = null
  dropStatus.value = null
  if (!id) return
  void moveCard(id, status)
}

onMounted(async () => {
  loading.value = true
  await Promise.all([activities.refreshList(), identity.load()])
  const lessons = activities.summaries.filter((item) => isInroadsMvpActivity(item.tags))
  const loaded = await Promise.all(
    lessons.map(async (item): Promise<QueueCard | null> => {
      try {
        const definition = await services.persistence.getById(item.id)
        const mvp = definition ? readInroadsMvpDefinition(definition) : null
        const status = lessonQueueStatus(mvp?.reviewStatus, item.published)
        if (
          status !== 'available' &&
          status !== 'in_progress' &&
          status !== 'review' &&
          status !== 'approval'
        ) {
          return null
        }
        return {
          id: item.id,
          title: definition?.metadata.title.trim() || item.title,
          country: mvp?.country.trim() ?? '',
          language: mvp?.language.trim() ?? '',
          status,
          assigneeId: mvp?.assigneeId ?? '',
          assigneeName: mvp?.assigneeName ?? '',
        }
      } catch {
        return null
      }
    }),
  )
  cards.value = loaded
    .filter((card): card is QueueCard => card != null)
    .sort((left, right) => left.title.localeCompare(right.title))
  loading.value = false
})

function act(card: QueueCard): void {
  if (!canAct(card)) return
  if (card.status === 'available') void moveCard(card.id, 'in_progress')
  else if (card.status === 'in_progress') void moveCard(card.id, 'review')
  else if (card.status === 'review') void moveCard(card.id, 'approval')
  else if (card.status === 'approval') void moveCard(card.id, 'approved')
}
</script>

<template>
  <div class="author-page queue-page">
    <div class="author-page-inner author-stack-sm">
      <div class="author-page-header">
        <div>
          <h1>Queue</h1>
        </div>
      </div>

      <p v-if="activities.error" class="author-error">{{ activities.error }}</p>
      <p v-if="actionError" class="author-error">{{ actionError }}</p>
      <p v-if="loading" class="author-muted">Loading lessons…</p>

      <div v-else class="queue-board">
        <section
          v-for="column in BOARD"
          :key="column.status"
          class="queue-column"
          :class="{ 'is-drop-target': dropStatus === column.status }"
          @dragover="onDragOver(column.status, $event)"
          @dragleave="onDragLeave(column.status, $event)"
          @drop="onDrop(column.status, $event)"
        >
          <h2 class="queue-column-title">
            <img :src="column.icon" alt="" />
            {{ column.label }}
          </h2>
          <div class="queue-column-cards">
            <article
              v-for="card in cardsFor(column.status)"
              :key="card.id"
              class="queue-card"
              :aria-label="card.title"
              :class="{
                'is-available': column.status === 'available',
                'is-dragging': draggingId === card.id,
              }"
              :draggable="updatingId !== card.id"
              @dragstart="onDragStart(card, $event)"
              @dragend="onDragEnd"
            >
              <div class="queue-card-copy">
                <RouterLink
                  :to="`/studio/inroads-mvp/${card.id}`"
                  class="queue-card-title"
                  draggable="false"
                >
                  {{ card.title }}
                </RouterLink>
                <p class="queue-card-locale">{{ localeLabel(card) }}</p>
              </div>
              <div
                class="queue-card-actions"
                :class="{ 'is-claim': column.status === 'available' }"
              >
                <span v-if="holderName(card)" class="queue-pill is-name">{{ holderName(card) }}</span>
                <button
                  type="button"
                  class="queue-pill"
                  :disabled="!canAct(card)"
                  :title="actionTitle(card)"
                  @click="act(card)"
                >
                  {{ updatingId === card.id ? 'Saving…' : column.action }}
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
