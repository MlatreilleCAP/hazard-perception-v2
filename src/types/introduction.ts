import type { MediaRef } from '@/types/media'
import {
  canonicalizeLessonCountry,
  canonicalizeLessonLanguage,
} from '@/lib/inroadsMvp/packageSpec'
import {
  readLessonReviewStatus,
  readQueueOrder,
  type LessonReviewStatus,
} from '@/types/inroadsMvp'

export const INTRODUCTION_TAG = 'introduction'
export const INTRODUCTION_NODE_TYPE = 'introduction.video'

export type IntroductionDefinition = {
  version: 1
  /** Absent until someone sets a queue status. A live publish stays published until then. */
  reviewStatus?: LessonReviewStatus
  /** User who currently holds this video in the queue. */
  assigneeId: string
  /** Name shown on the queue card for the current holder. */
  assigneeName: string
  /** Reviewer notes shown on the queue card after changes are requested. */
  reviewNotes: string
  /** Manual position in a queue column. Unset cards sort by the date they were added. */
  queueOrder: number | null
  /** Title in Details. Independent of the activity name used in the header and queue. */
  videoTitle: string
  introMedia: MediaRef | null
  /** Closed captions (.vtt) for the intro video. */
  introCaptions: MediaRef | null
  /** Clip played from the Observe instruction Example button. */
  exampleMedia: MediaRef | null
  introShowOnFirstVisitOnly: boolean
  country: string
  language: string
}

export function isIntroductionActivity(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(INTRODUCTION_TAG)
}

function readMediaRef(raw: unknown): MediaRef | null {
  if (!raw || typeof raw !== 'object') return null
  const id = (raw as { media_asset_id?: unknown }).media_asset_id
  if (typeof id === 'string' && id.trim()) return { media_asset_id: id.trim() }
  return null
}

export function createDefaultIntroductionDefinition(): IntroductionDefinition {
  return {
    version: 1,
    assigneeId: '',
    assigneeName: '',
    reviewNotes: '',
    queueOrder: null,
    videoTitle: '',
    introMedia: null,
    introCaptions: null,
    exampleMedia: null,
    introShowOnFirstVisitOnly: true,
    country: '',
    language: '',
  }
}

export function cloneIntroductionDefinition(
  definition: IntroductionDefinition,
): IntroductionDefinition {
  return {
    version: 1,
    reviewStatus: readLessonReviewStatus(definition.reviewStatus),
    assigneeId: definition.assigneeId.trim(),
    assigneeName: definition.assigneeName.trim(),
    reviewNotes: definition.reviewNotes.trim(),
    queueOrder: readQueueOrder(definition.queueOrder),
    videoTitle: definition.videoTitle.trim(),
    introMedia: definition.introMedia
      ? { media_asset_id: definition.introMedia.media_asset_id }
      : null,
    introCaptions: definition.introCaptions
      ? { media_asset_id: definition.introCaptions.media_asset_id }
      : null,
    exampleMedia: definition.exampleMedia
      ? { media_asset_id: definition.exampleMedia.media_asset_id }
      : null,
    introShowOnFirstVisitOnly: definition.introShowOnFirstVisitOnly !== false,
    country: definition.country,
    language: definition.language,
  }
}

export function normalizeIntroductionDefinition(
  raw: Partial<IntroductionDefinition> | null | undefined,
): IntroductionDefinition {
  return {
    version: 1,
    reviewStatus: readLessonReviewStatus(raw?.reviewStatus),
    assigneeId: typeof raw?.assigneeId === 'string' ? raw.assigneeId.trim() : '',
    assigneeName: typeof raw?.assigneeName === 'string' ? raw.assigneeName.trim() : '',
    reviewNotes: typeof raw?.reviewNotes === 'string' ? raw.reviewNotes.trim() : '',
    queueOrder: readQueueOrder(raw?.queueOrder),
    videoTitle: typeof raw?.videoTitle === 'string' ? raw.videoTitle.trim() : '',
    introMedia: readMediaRef(raw?.introMedia),
    introCaptions: readMediaRef(raw?.introCaptions),
    exampleMedia: readMediaRef(raw?.exampleMedia),
    introShowOnFirstVisitOnly: raw?.introShowOnFirstVisitOnly !== false,
    country: canonicalizeLessonCountry(typeof raw?.country === 'string' ? raw.country : ''),
    language: canonicalizeLessonLanguage(typeof raw?.language === 'string' ? raw.language : ''),
  }
}
