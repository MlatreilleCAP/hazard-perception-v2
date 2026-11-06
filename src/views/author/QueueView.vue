<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { readIntroductionDefinition } from '@/activities/introductionDefinition'
import availableIcon from '@/assets/queue/available.svg'
import inProgressIcon from '@/assets/queue/in-progress.svg'
import reviewIcon from '@/assets/queue/review.svg'
import { canonicalActivityId } from '@/app/id'
import { services } from '@/app/container'
import { useQueueIdentity } from '@/composables/useQueueIdentity'
import { downloadBlob } from '@/lib/inroadsMvp/buildImportTemplate'
import { draftLanguageVariantIds } from '@/lib/inroadsMvp/languageQueueStatus'
import { lessonVersionKey } from '@/lib/inroadsMvp/lessonVersions'
import {
  APPROVER_NAME,
  MANAGING_EDITOR_NAME,
  approverAssignee,
  reviewerAssignee,
} from '@/lib/lesson/queueAssignment'
import { exportIntroductionAssetsZip } from '@/services/exportIntroductionPackage'
import { exportLessonTemplateZip } from '@/services/exportInroadsMvpPackage'
import { listQueueSnapshots } from '@/services/queueSnapshots'
import {
  markDraftLanguageVariantsAvailable,
  publishInroadsMvpLesson,
  setLessonQueuePlacement,
  setLessonReviewNotes,
  unpublishInroadsMvpLesson,
} from '@/services/publishInroadsMvp'
import { useActivityStore } from '@/stores/activityStore'
import { isIntroductionActivity } from '@/types/introduction'
import {
  isInroadsMvpActivity,
  lessonQueueStatus,
  readQueueOrder,
  type LessonReviewStatus,
} from '@/types/inroadsMvp'

const activities = useActivityStore()
const identity = useQueueIdentity()

type QueueCard = {
  id: string
  kind: 'lesson' | 'video'
  title: string
  country: string
  language: string
  status: LessonReviewStatus
  assigneeId: string
  assigneeName: string
  reviewNotes: string
  addedAt: number
  queueOrder: number | null
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

const QUEUE_TABS = [
  { id: 'project', label: 'Project Management' },
  { id: 'published', label: 'Published' },
] as const

type QueueTab = (typeof QUEUE_TABS)[number]['id']

const PUBLISHED_TYPES = [
  { id: 'all', label: 'All types' },
  { id: 'lesson', label: 'Lesson' },
  { id: 'video', label: 'Stand Alone Video' },
] as const

type PublishedType = (typeof PUBLISHED_TYPES)[number]['id']

const cards = ref<QueueCard[]>([])
const loading = ref(true)
const activeTab = ref<QueueTab>('project')
const publishedType = ref<PublishedType>('all')
const updatingId = ref<string | null>(null)
const reviewMenuId = ref<string | null>(null)
const noteCardId = ref<string | null>(null)
const changesForId = ref<string | null>(null)
const changesNote = ref('')
const republishingId = ref<string | null>(null)
const unpublishingId = ref<string | null>(null)
const downloadingId = ref<string | null>(null)
const draggingId = ref<string | null>(null)
const dropStatus = ref<BoardStatus | null>(null)
const dropPlace = ref<{ id: string; place: 'before' | 'after' } | null>(null)
const actionError = ref<string | null>(null)

function isOnPublishedTab(status: LessonReviewStatus): boolean {
  return status === 'published' || status === 'approved'
}

const projectCards = computed(() =>
  cards.value.filter((card) => BOARD.some((column) => column.status === card.status)),
)
const publishedCards = computed(() =>
  sortCards(cards.value.filter((card) => isOnPublishedTab(card.status))),
)
const visiblePublishedCards = computed(() => {
  if (publishedType.value === 'all') return publishedCards.value
  return publishedCards.value.filter((card) => card.kind === publishedType.value)
})

function publishedEmptyMessage(): string {
  if (publishedType.value === 'lesson') return 'No published lessons.'
  if (publishedType.value === 'video') return 'No published stand alone videos.'
  return 'Nothing published yet.'
}

function countFor(tab: QueueTab): number {
  return tab === 'published' ? publishedCards.value.length : projectCards.value.length
}

function localeLabel(card: QueueCard): string {
  const parts = [card.country, card.language].filter(Boolean)
  return parts.join(' - ') || 'Language not set'
}

function editorPath(card: QueueCard): string {
  return card.kind === 'video'
    ? `/studio/stand-alone-video/${card.id}`
    : `/studio/inroads-mvp/${card.id}`
}

function previewRoute(card: QueueCard): { path: string; query: Record<string, string> } {
  if (card.kind === 'video') {
    return { path: '/player', query: { activity: card.id, preview: '1', intro: '1' } }
  }
  return {
    path: '/player',
    query: { activity: card.id, preview: '1', mvp: '1', section: 'lesson' },
  }
}

const BOARD_STATUSES: BoardStatus[] = ['available', 'in_progress', 'review', 'approval']

function isBoardStatus(status: LessonReviewStatus): status is BoardStatus {
  return BOARD_STATUSES.includes(status as BoardStatus)
}

function cardsFor(status: QueueCard['status']): QueueCard[] {
  const items = cards.value.filter((card) => card.status === status)
  return status === 'available' ? sortAvailableCards(items) : sortCards(items)
}

function holderName(card: QueueCard): string {
  if (card.status === 'review') return MANAGING_EDITOR_NAME
  if (card.status === 'approval') return APPROVER_NAME
  return card.assigneeName
}

function canSubmitReview(): boolean {
  return identity.canReview.value || identity.canApprove.value
}

function canAct(card: QueueCard): boolean {
  if (updatingId.value) return false
  if (card.status === 'available') return true
  if (card.status === 'in_progress') {
    return !card.assigneeId || card.assigneeId === identity.userId.value
  }
  if (card.status === 'review') return canSubmitReview()
  if (card.status === 'approval') return identity.canApprove.value
  return false
}

function actionTitle(card: QueueCard): string | undefined {
  if (canAct(card)) return undefined
  if (card.status === 'in_progress') return 'Only the person who claimed this lesson can submit it'
  if (card.status === 'review') {
    return `Only ${MANAGING_EDITOR_NAME} or ${APPROVER_NAME} can submit these lessons`
  }
  if (card.status === 'approval') return `Only ${APPROVER_NAME} can approve lessons`
  return undefined
}

const changesCard = computed(
  () => cards.value.find((card) => card.id === changesForId.value) ?? null,
)
const canClearNotes = computed(() => identity.canApprove.value)
const canRepublish = computed(() => identity.canApprove.value)

function editorAssignee(card: QueueCard): { id: string; name: string } | null {
  if (!card.assigneeId && !card.assigneeName) return null
  return { id: card.assigneeId, name: card.assigneeName }
}

function placementFor(status: BoardStatus | 'approved'): { id: string; name: string } | null {
  const actor = {
    id: identity.userId.value ?? '',
    name: identity.name.value,
    email: identity.email.value ?? '',
  }
  if (status === 'in_progress') {
    return { id: actor.id, name: actor.name || 'Unassigned' }
  }
  if (status === 'review') return reviewerAssignee(actor)
  if (status === 'approval' || status === 'approved') return approverAssignee(actor)
  return null
}

function orderKey(card: QueueCard): number {
  return card.queueOrder ?? card.addedAt
}

function sortCards(items: QueueCard[]): QueueCard[] {
  return [...items].sort((left, right) => {
    const delta = orderKey(left) - orderKey(right)
    if (delta !== 0) return delta
    return left.title.localeCompare(right.title)
  })
}

type AvailableGroup = {
  key: string
  label: string
  cards: QueueCard[]
}

type QueueEntry =
  | { kind: 'header'; key: string; label: string; count: number; country: string }
  | { kind: 'card'; key: string; card: QueueCard; grouped: boolean }

const openCountries = ref(new Set<string>())

function countryKey(country: string): string {
  return country.trim().toLowerCase() || '__none__'
}

function countryLabel(country: string): string {
  return country.trim() || 'No country'
}

function availableGroups(items: QueueCard[]): AvailableGroup[] {
  const groups: AvailableGroup[] = []
  for (const card of sortAvailableCards(items)) {
    const key = countryKey(card.country)
    const current = groups[groups.length - 1]
    if (current && current.key === key) current.cards.push(card)
    else groups.push({ key, label: countryLabel(card.country), cards: [card] })
  }
  return groups
}

function countryOpen(key: string): boolean {
  return openCountries.value.has(key)
}

function toggleCountry(key: string): void {
  const next = new Set(openCountries.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openCountries.value = next
}

function cardEntries(entry: QueueEntry): QueueCard[] {
  return entry.kind === 'card' ? [entry.card] : []
}

function entriesFor(status: BoardStatus): QueueEntry[] {
  const items = cardsFor(status)
  if (status !== 'available') {
    return items.map((card) => ({ kind: 'card', key: card.id, card, grouped: false }))
  }
  const entries: QueueEntry[] = []
  for (const group of availableGroups(items)) {
    entries.push({
      kind: 'header',
      key: `country-${group.key}`,
      label: group.label,
      count: group.cards.length,
      country: group.key,
    })
    if (!countryOpen(group.key)) continue
    for (const card of group.cards) {
      entries.push({ kind: 'card', key: card.id, card, grouped: true })
    }
  }
  return entries
}

/** Available stays grouped by country (the locale under the title), then title and language. */
function sortAvailableCards(items: QueueCard[]): QueueCard[] {
  return [...items].sort((left, right) => {
    const byCountry = (left.country || '\uffff').localeCompare(right.country || '\uffff')
    if (byCountry !== 0) return byCountry
    const byTitle = left.title.localeCompare(right.title)
    if (byTitle !== 0) return byTitle
    const byLanguage = left.language.localeCompare(right.language)
    if (byLanguage !== 0) return byLanguage
    return orderKey(left) - orderKey(right)
  })
}

function orderBetween(before: QueueCard | undefined, after: QueueCard | undefined): number {
  const left = before ? orderKey(before) : null
  const right = after ? orderKey(after) : null
  if (left != null && right != null) return left === right ? left + 1 : (left + right) / 2
  if (left != null) return left + 1000
  if (right != null) return right - 1000
  return Date.now()
}

function addedAtFrom(createdAt: string | undefined): number {
  const parsed = Date.parse(createdAt ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function assigneeFor(
  card: QueueCard,
  status: BoardStatus | 'approved',
): { id: string; name: string } | null {
  if (status === 'review') return editorAssignee(card) ?? placementFor(status)
  return placementFor(status)
}

async function moveCard(
  id: string,
  status: BoardStatus | 'approved',
  options?: { reviewNotes?: string; assignee?: { id: string; name: string } | null },
): Promise<boolean> {
  const previous = cards.value.find((item) => item.id === id)
  if (!previous || previous.status === status || updatingId.value) return false
  if (status === 'approved' && !identity.canApprove.value) {
    actionError.value = `Only ${APPROVER_NAME} can approve lessons`
    return false
  }
  if (status === 'approval' && !canSubmitReview()) {
    actionError.value = `Only ${MANAGING_EDITOR_NAME} or ${APPROVER_NAME} can submit these lessons`
    return false
  }
  updatingId.value = id
  actionError.value = null
  reviewMenuId.value = null
  const assignee =
    options && 'assignee' in options ? (options.assignee ?? null) : assigneeFor(previous, status)
  const reviewNotes =
    options?.reviewNotes !== undefined ? options.reviewNotes.trim() : previous.reviewNotes
  const without = cards.value.filter((item) => item.id !== id)
  cards.value = sortCards([
    ...without,
    {
      ...previous,
      status,
      assigneeId: assignee?.id ?? '',
      assigneeName: assignee?.name ?? '',
      reviewNotes,
    },
  ])
  try {
    await setLessonQueuePlacement(id, status, assignee, options?.reviewNotes)
    return true
  } catch (cause) {
    cards.value = sortCards([...cards.value.filter((item) => item.id !== id), previous])
    actionError.value = cause instanceof Error ? cause.message : 'Failed to update the lesson'
    return false
  } finally {
    updatingId.value = null
  }
}

function onDragStart(card: QueueCard, event: DragEvent): void {
  if (updatingId.value) {
    event.preventDefault()
    return
  }
  reviewMenuId.value = null
  noteCardId.value = null
  draggingId.value = card.id
  event.dataTransfer?.setData('text/plain', card.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragEnd(): void {
  draggingId.value = null
  dropStatus.value = null
  dropPlace.value = null
}

function onDragOver(status: BoardStatus, event: DragEvent): void {
  const card = cards.value.find((item) => item.id === draggingId.value)
  if (!card) return
  event.preventDefault()
  dropPlace.value = null
  dropStatus.value = card.status === status ? null : status
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onDragLeave(status: BoardStatus, event: DragEvent): void {
  const current = event.currentTarget
  const next = event.relatedTarget
  if (current instanceof Node && next instanceof Node && current.contains(next)) return
  if (dropStatus.value === status) dropStatus.value = null
  dropPlace.value = null
}

function onCardDragOver(card: QueueCard, event: DragEvent): void {
  if (!draggingId.value || draggingId.value === card.id || !isBoardStatus(card.status)) return
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  const rect = target.getBoundingClientRect()
  const place = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  dropPlace.value = { id: card.id, place }
  const dragged = cards.value.find((item) => item.id === draggingId.value)
  dropStatus.value = dragged && dragged.status !== card.status ? card.status : null
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function draggedCardId(event: DragEvent): string {
  return (
    canonicalActivityId(draggingId.value) ||
    canonicalActivityId(event.dataTransfer?.getData('text/plain'))
  )
}

function onCardDrop(card: QueueCard, event: DragEvent): void {
  event.preventDefault()
  event.stopPropagation()
  const id = draggedCardId(event)
  const place = dropPlace.value?.id === card.id ? dropPlace.value.place : 'before'
  onDragEnd()
  if (!id || !isBoardStatus(card.status)) return
  void placeCard(id, card.status, card.id, place)
}

function onDrop(status: BoardStatus, event: DragEvent): void {
  event.preventDefault()
  const id = draggedCardId(event)
  onDragEnd()
  if (!id) return
  void placeCard(id, status, null, 'after')
}

async function placeCard(
  id: string,
  status: BoardStatus,
  targetId: string | null,
  place: 'before' | 'after',
): Promise<void> {
  const previous = cards.value.find((item) => item.id === id)
  if (!previous || updatingId.value || id === targetId) return
  if (status !== previous.status && status === 'approval' && !canSubmitReview()) {
    actionError.value = `Only ${MANAGING_EDITOR_NAME} or ${APPROVER_NAME} can submit these lessons`
    return
  }
  const column = sortCards(
    cards.value.filter((item) => item.status === status && item.id !== id),
  )
  let index = column.length
  if (targetId) {
    const targetIndex = column.findIndex((item) => item.id === targetId)
    if (targetIndex < 0) return
    index = place === 'before' ? targetIndex : targetIndex + 1
  }
  const before = column[index - 1]
  const after = column[index]
  if (previous.status === status) {
    const current = sortCards(cards.value.filter((item) => item.status === status))
    const currentIndex = current.findIndex((item) => item.id === id)
    const sameNeighbors =
      (current[currentIndex - 1]?.id ?? null) === (before?.id ?? null) &&
      (current[currentIndex + 1]?.id ?? null) === (after?.id ?? null)
    if (sameNeighbors) return
  }
  const queueOrder = orderBetween(before, after)
  const assignee =
    status === previous.status
      ? previous.assigneeId || previous.assigneeName
        ? { id: previous.assigneeId, name: previous.assigneeName }
        : null
      : assigneeFor(previous, status)
  updatingId.value = id
  actionError.value = null
  reviewMenuId.value = null
  const without = cards.value.filter((item) => item.id !== id)
  cards.value = sortCards([
    ...without,
    {
      ...previous,
      status,
      assigneeId: assignee?.id ?? '',
      assigneeName: assignee?.name ?? '',
      queueOrder,
    },
  ])
  try {
    await setLessonQueuePlacement(id, status, assignee, undefined, queueOrder)
    if (status === 'available') {
      try {
        const marked = await markDraftLanguageVariantsAvailable(id)
        const extras = (
          await Promise.all(marked.map((markedId) => availableCard(markedId)))
        ).filter((card): card is QueueCard => card != null)
        if (extras.length > 0) {
          cards.value = sortCards([...cards.value, ...extras])
        }
      } catch {
        // The moved lesson is already available. Sibling updates can retry on the next visit.
      }
    }
  } catch (cause) {
    cards.value = sortCards([...cards.value.filter((item) => item.id !== id), previous])
    actionError.value = cause instanceof Error ? cause.message : 'Failed to update the lesson'
  } finally {
    updatingId.value = null
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeyDown)
})

async function availableCard(id: string): Promise<QueueCard | null> {
  const definition = await services.persistence.getById(id)
  if (!definition) return null
  const lesson = isInroadsMvpActivity(definition.metadata.tags)
  const mvp = lesson ? readInroadsMvpDefinition(definition) : null
  const intro =
    !lesson && isIntroductionActivity(definition.metadata.tags)
      ? readIntroductionDefinition(definition)
      : null
  const parsed = mvp ?? intro
  if (!parsed) return null
  return {
    id,
    kind: lesson ? 'lesson' : 'video',
    title: definition.metadata.title.trim(),
    country: parsed.country.trim(),
    language: parsed.language.trim(),
    status: 'available',
    assigneeId: '',
    assigneeName: '',
    reviewNotes: parsed.reviewNotes.trim(),
    addedAt: addedAtFrom(definition.metadata.createdAt),
    queueOrder: readQueueOrder(parsed.queueOrder),
  }
}

const QUEUE_LOAD_LIMIT = 8

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const item = items[index]
      if (item === undefined) return
      results[index] = await map(item)
    }
  })
  await Promise.all(workers)
  return results
}

function cardFromSnapshot(
  id: string,
  kind: QueueCard['kind'],
  published: boolean,
  fallbackTitle: string,
  snapshot: {
    createdAt: string
    country: string
    language: string
    reviewStatus: QueueCard['status'] | undefined
    assigneeId: string
    assigneeName: string
    reviewNotes: string
    queueOrder: number | null
  } | undefined,
): QueueCard {
  return {
    id,
    kind,
    title: fallbackTitle,
    country: snapshot?.country ?? '',
    language: snapshot?.language ?? '',
    status: lessonQueueStatus(snapshot?.reviewStatus, published),
    assigneeId: snapshot?.assigneeId ?? '',
    assigneeName: snapshot?.assigneeName ?? '',
    reviewNotes: snapshot?.reviewNotes ?? '',
    addedAt: addedAtFrom(snapshot?.createdAt),
    queueOrder: snapshot?.queueOrder ?? null,
  }
}

function visibleOnQueue(card: QueueCard): boolean {
  return isBoardStatus(card.status) || isOnPublishedTab(card.status)
}

/** Draft languages of a lesson already in Available join the board without another full scan. */
async function promoteLoadedDrafts(loaded: QueueCard[]): Promise<void> {
  const groups = new Map<string, QueueCard[]>()
  for (const card of loaded) {
    const key = `${card.kind}:${lessonVersionKey(card.title)}`
    const group = groups.get(key)
    if (group) group.push(card)
    else groups.set(key, [card])
  }
  const drafts: QueueCard[] = []
  for (const group of groups.values()) {
    const ids = new Set(
      draftLanguageVariantIds(group.map((card) => ({ id: card.id, status: card.status }))),
    )
    for (const card of group) {
      if (ids.has(card.id)) drafts.push(card)
    }
  }
  if (drafts.length === 0) return
  const promoted: QueueCard[] = []
  await mapPool(drafts, QUEUE_LOAD_LIMIT, async (card) => {
    try {
      await setLessonQueuePlacement(card.id, 'available', null)
      promoted.push({ ...card, status: 'available', assigneeId: '', assigneeName: '' })
    } catch {
      // The board is already visible. A failed draft can retry on the next visit.
    }
  })
  if (promoted.length === 0) return
  const ids = new Set(promoted.map((card) => card.id))
  cards.value = sortCards([...cards.value.filter((card) => !ids.has(card.id)), ...promoted])
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([activities.refreshList(), identity.load()])
    const jobs = [
      ...activities.summaries
        .filter((item) => isInroadsMvpActivity(item.tags))
        .map((item) => ({
          id: item.id,
          kind: 'lesson' as const,
          published: item.published,
          title: item.title,
        })),
      ...activities.summaries
        .filter((item) => isIntroductionActivity(item.tags))
        .map((item) => ({
          id: item.id,
          kind: 'video' as const,
          published: item.published,
          title: item.title,
        })),
    ]
    const snapshots = await listQueueSnapshots(jobs.map((job) => job.id))
    const loaded = jobs.map((job) =>
      cardFromSnapshot(job.id, job.kind, job.published, job.title, snapshots.get(job.id)),
    )
    cards.value = sortCards(loaded.filter(visibleOnQueue))
    loading.value = false
    await promoteLoadedDrafts(loaded)
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Failed to load the queue'
  } finally {
    loading.value = false
  }
})

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (reviewMenuId.value) {
    const menu = document.querySelector(`[data-review-menu="${reviewMenuId.value}"]`)
    if (!menu?.contains(target)) reviewMenuId.value = null
  }
  if (noteCardId.value) {
    const note = document.querySelector(`[data-note-popover="${noteCardId.value}"]`)
    if (!note?.contains(target)) noteCardId.value = null
  }
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  reviewMenuId.value = null
  noteCardId.value = null
  if (!updatingId.value) changesForId.value = null
}

async function republish(card: QueueCard): Promise<void> {
  if (!canRepublish.value || republishingId.value || unpublishingId.value || !isOnPublishedTab(card.status)) {
    return
  }
  republishingId.value = card.id
  actionError.value = null
  try {
    if (card.kind === 'video') {
      await services.persistence.publish(card.id)
    } else {
      await publishInroadsMvpLesson(card.id)
    }
    if (card.status !== 'published') {
      const assignee = approverAssignee({
        id: identity.userId.value ?? '',
        name: identity.name.value,
        email: identity.email.value ?? '',
      })
      await setLessonQueuePlacement(card.id, 'published', assignee)
      cards.value = cards.value.map((item) =>
        item.id === card.id
          ? {
              ...item,
              status: 'published',
              assigneeId: assignee.id,
              assigneeName: assignee.name,
            }
          : item,
      )
    }
    await activities.refreshList()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Failed to re-publish'
  } finally {
    republishingId.value = null
  }
}

async function unpublish(card: QueueCard): Promise<void> {
  if (!canRepublish.value || republishingId.value || unpublishingId.value || !isOnPublishedTab(card.status)) {
    return
  }
  unpublishingId.value = card.id
  actionError.value = null
  try {
    if (card.kind === 'video') {
      await services.persistence.unpublish(card.id)
    } else {
      await unpublishInroadsMvpLesson(card.id)
    }
    await setLessonQueuePlacement(card.id, 'available', null)
    cards.value = cards.value.map((item) =>
      item.id === card.id
        ? { ...item, status: 'available', assigneeId: '', assigneeName: '' }
        : item,
    )
    await activities.refreshList()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Failed to unpublish'
  } finally {
    unpublishingId.value = null
  }
}

async function downloadAssets(card: QueueCard): Promise<void> {
  if (!isOnPublishedTab(card.status) || downloadingId.value) return
  downloadingId.value = card.id
  actionError.value = null
  const source = card.status === 'published' ? 'published' : 'draft'
  try {
    const packed =
      card.kind === 'video'
        ? await exportIntroductionAssetsZip(card.id, source)
        : await exportLessonTemplateZip(card.id, {
            includeMedia: true,
            source,
          })
    downloadBlob(packed.blob, packed.filename)
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Failed to download'
  } finally {
    downloadingId.value = null
  }
}

function act(card: QueueCard): void {
  if (!canAct(card)) return
  if (card.status === 'available') void moveCard(card.id, 'in_progress')
  else if (card.status === 'in_progress') void moveCard(card.id, 'review')
  else if (card.status === 'approval') void moveCard(card.id, 'approved')
}

function toggleReviewMenu(card: QueueCard): void {
  if (!canAct(card)) return
  noteCardId.value = null
  reviewMenuId.value = reviewMenuId.value === card.id ? null : card.id
}

function chooseApproved(card: QueueCard): void {
  reviewMenuId.value = null
  void moveCard(card.id, 'approval', { reviewNotes: '' })
}

function openChanges(card: QueueCard): void {
  reviewMenuId.value = null
  noteCardId.value = null
  changesForId.value = card.id
  changesNote.value = ''
}

function closeChanges(): void {
  if (updatingId.value) return
  changesForId.value = null
  changesNote.value = ''
}

async function submitChanges(): Promise<void> {
  const card = changesCard.value
  const note = changesNote.value.trim()
  if (!card || !note) return
  const saved = await moveCard(card.id, 'in_progress', {
    reviewNotes: note,
    assignee: editorAssignee(card),
  })
  if (!saved) return
  changesForId.value = null
  changesNote.value = ''
}

function toggleNote(card: QueueCard): void {
  reviewMenuId.value = null
  noteCardId.value = noteCardId.value === card.id ? null : card.id
}

async function clearNote(card: QueueCard): Promise<void> {
  if (!identity.canApprove.value || updatingId.value || !card.reviewNotes) return
  updatingId.value = card.id
  actionError.value = null
  const previous = cards.value
  noteCardId.value = null
  cards.value = cards.value.map((item) =>
    item.id === card.id ? { ...item, reviewNotes: '' } : item,
  )
  try {
    await setLessonReviewNotes(card.id, '')
  } catch (cause) {
    cards.value = previous
    noteCardId.value = card.id
    actionError.value = cause instanceof Error ? cause.message : 'Failed to clear the note'
  } finally {
    updatingId.value = null
  }
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

      <nav class="mvp-section-nav" aria-label="Queue">
        <button
          v-for="tab in QUEUE_TABS"
          :key="tab.id"
          type="button"
          class="mvp-section-tab"
          :class="{ active: activeTab === tab.id }"
          :aria-pressed="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}{{ loading ? '' : ` (${countFor(tab.id)})` }}
        </button>
      </nav>

      <p v-if="activities.error" class="author-error">{{ activities.error }}</p>
      <p v-if="actionError" class="author-error">{{ actionError }}</p>
      <p v-if="loading" class="author-muted">Loading lessons…</p>

      <div v-else-if="activeTab === 'project'" class="queue-board">
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
            <template v-for="entry in entriesFor(column.status)" :key="entry.key">
            <button
              v-if="entry.kind === 'header'"
              type="button"
              class="queue-country"
              :aria-expanded="countryOpen(entry.country)"
              @click="toggleCountry(entry.country)"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path
                  d="M4.5 6.5 8 10l3.5-3.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>{{ entry.label }}</span>
              <span class="queue-country-count">{{ entry.count }}</span>
            </button>
            <template v-else>
            <article
              v-for="card in cardEntries(entry)"
              :key="card.id"
              class="queue-card"
              :aria-label="card.title"
              :class="{
                'is-grouped': entry.kind === 'card' && entry.grouped,
                'is-available': column.status === 'available',
                'is-dragging': draggingId === card.id,
                'is-open': reviewMenuId === card.id || noteCardId === card.id,
                'is-drop-before': dropPlace?.id === card.id && dropPlace.place === 'before',
                'is-drop-after': dropPlace?.id === card.id && dropPlace.place === 'after',
              }"
              :draggable="updatingId !== card.id"
              @dragstart="onDragStart(card, $event)"
              @dragend="onDragEnd"
              @dragover="onCardDragOver(card, $event)"
              @drop="onCardDrop(card, $event)"
            >
              <div class="queue-card-copy">
                <div class="queue-card-heading">
                  <RouterLink
                    :to="editorPath(card)"
                    class="queue-card-title"
                    draggable="false"
                  >
                    {{ card.title }}
                  </RouterLink>
                  <div
                    v-if="card.reviewNotes"
                    class="queue-note"
                    :data-note-popover="card.id"
                  >
                    <button
                      type="button"
                      class="queue-card-note"
                      aria-label="Review notes"
                      :aria-expanded="noteCardId === card.id"
                      draggable="false"
                      @pointerdown.stop
                      @click.stop="toggleNote(card)"
                    >
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                        <path
                          d="M6.2 8.6 10.7 4a2.1 2.1 0 0 1 3 3L8.6 12.2a3.1 3.1 0 0 1-4.4-4.4l5.2-5.1a4 4 0 0 1 5.6 5.7l-4.3 4.3"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </button>
                    <div
                      v-if="noteCardId === card.id"
                      class="queue-note-popover"
                      role="dialog"
                      aria-label="Review notes"
                    >
                      <p>{{ card.reviewNotes }}</p>
                      <button
                        v-if="canClearNotes"
                        type="button"
                        class="queue-note-clear"
                        :disabled="updatingId === card.id"
                        draggable="false"
                        @pointerdown.stop
                        @click.stop="clearNote(card)"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
                <p class="queue-card-locale">{{ localeLabel(card) }}</p>
              </div>
              <div
                class="queue-card-actions"
                :class="{ 'is-claim': column.status === 'available' }"
              >
                <span v-if="holderName(card)" class="queue-pill is-name">{{ holderName(card) }}</span>
                <div
                  v-if="column.status === 'review'"
                  class="author-menu queue-review-menu"
                  :data-review-menu="card.id"
                  @pointerdown.stop
                >
                  <button
                    type="button"
                    class="queue-pill"
                    :disabled="!canAct(card)"
                    :title="actionTitle(card)"
                    :aria-expanded="reviewMenuId === card.id"
                    aria-haspopup="menu"
                    draggable="false"
                    @click.stop="toggleReviewMenu(card)"
                  >
                    {{ updatingId === card.id ? 'Saving…' : 'Submit' }}
                  </button>
                  <div
                    v-if="reviewMenuId === card.id"
                    class="author-menu-panel queue-review-menu-panel"
                    role="menu"
                    aria-label="Submit"
                  >
                    <button
                      type="button"
                      class="author-menu-item"
                      role="menuitem"
                      @click="chooseApproved(card)"
                    >
                      Approved
                    </button>
                    <button
                      type="button"
                      class="author-menu-item"
                      role="menuitem"
                      @click="openChanges(card)"
                    >
                      Changes needed
                    </button>
                  </div>
                </div>
                <button
                  v-else
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
            </template>
            </template>
          </div>
        </section>
      </div>

      <section v-else class="author-list-card">
        <div class="author-list-card-head">
          <h2>Published</h2>
          <span class="author-count">{{ visiblePublishedCards.length }}</span>
          <label class="queue-type-filter">
            <span>Type</span>
            <select v-model="publishedType" aria-label="Type">
              <option v-for="option in PUBLISHED_TYPES" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
        <div v-if="visiblePublishedCards.length === 0" class="author-list-empty">
          <p class="author-muted">{{ publishedEmptyMessage() }}</p>
        </div>
        <ul v-else class="author-list">
          <li v-for="card in visiblePublishedCards" :key="card.id" class="author-list-row">
            <div class="queue-row-main">
              <div style="min-width: 0; flex: 1">
                <RouterLink :to="editorPath(card)" class="author-list-title">
                  {{ card.title }}
                </RouterLink>
                <p class="author-list-sub">{{ localeLabel(card) }}</p>
              </div>
              <button
                v-if="canRepublish"
                type="button"
                class="author-pill author-pill-white"
                :disabled="republishingId !== null || unpublishingId !== null"
                @click="republish(card)"
              >
                {{ republishingId === card.id ? 'Re-publishing…' : 'Re-publish' }}
              </button>
              <button
                v-if="canRepublish"
                type="button"
                class="author-pill author-pill-white"
                :disabled="republishingId !== null || unpublishingId !== null"
                @click="unpublish(card)"
              >
                {{ unpublishingId === card.id ? 'Unpublishing…' : 'Unpublish' }}
              </button>
              <button
                type="button"
                class="author-pill author-pill-white"
                :disabled="downloadingId === card.id"
                @click="downloadAssets(card)"
              >
                {{ downloadingId === card.id ? 'Downloading…' : 'Download' }}
              </button>
              <RouterLink class="author-pill author-pill-white" :to="previewRoute(card)">
                Preview
              </RouterLink>
            </div>
          </li>
        </ul>
      </section>

      <div
        v-if="changesCard"
        class="queue-notes-backdrop"
        @click.self="closeChanges"
        @keydown.esc="closeChanges"
      >
        <form class="queue-notes-panel" @submit.prevent="submitChanges">
          <h2>Changes needed</h2>
          <p>{{ changesCard.title }}</p>
          <label>
            Notes
            <textarea
              v-model="changesNote"
              rows="5"
              required
              autofocus
              placeholder="What needs to change?"
            />
          </label>
          <div class="queue-notes-actions">
            <button type="button" class="author-pill author-pill-ghost" @click="closeChanges">
              Cancel
            </button>
            <button
              type="submit"
              class="author-pill author-pill-primary"
              :disabled="!changesNote.trim() || updatingId === changesCard.id"
            >
              {{ updatingId === changesCard.id ? 'Saving…' : 'Send back' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
