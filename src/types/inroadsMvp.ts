import {
  canonicalizeLessonCountry,
  canonicalizeLessonLanguage,
} from '@/lib/inroadsMvp/packageSpec'
import type { MediaRef } from '@/types/media'

export const INROADS_MVP_TAG = 'inroads-mvp'
export const INROADS_MVP_NODE_TYPE = 'inroads.mvp'
/** Marks Observe/Process/Anticipate activities owned by an Inroads MVP lesson. */
export const INROADS_MVP_CHILD_TAG = 'inroads-mvp-child'

export type InroadsMvpDefinition = {
  version: 1
  /** Section 1 — intro clip before Observe / Process / Anticipate. */
  introMedia: MediaRef | null
  introShowOnFirstVisitOnly: boolean
  /** Stand Alone Video activity id; when empty, no intro plays before Observe. */
  introductionActivityId: string
  country: string
  language: string
  /** Label for every learner Continue / Start button in this lesson. */
  buttonLabel: string
  /** Label for every severity-question Submit button in this lesson. */
  submitLabel: string
  /** Final results heading when the lesson is passed. */
  challengePassedLabel: string
  /** Final results heading when the lesson is failed. */
  challengeFailedLabel: string
  /** Observe clip-intro heading for the maneuver row. */
  maneuverLabel: string
  /** Observe clip-intro heading for the roadway row. */
  roadwayLabel: string
  /** Observe clip-intro heading for the traffic density row. */
  trafficDensityLabel: string
  /** Observe clip-intro heading for the time of day row. */
  timeOfDayLabel: string
  /** Observe clip-intro heading for the road conditions row. */
  roadConditionsLabel: string
  /** Final results suffix after a section score, e.g. "40 pts". */
  ptsLabel: string
  /** Final results Observe metric label. */
  detectionLabel: string
  /** Final results Observe metric label. */
  accuracyLabel: string
  /** Final results coaching metric label. */
  coachingLabel: string
  /** Final results label for the first question metric. */
  q1Label: string
  /** Final results label for the second question metric. */
  q2Label: string
  /** Final results label for the third question metric. */
  q3Label: string
  /** Final results label for the fourth question metric. */
  q4Label: string
  /** Final results Observe section title. */
  observeLabel: string
  /** Final results Process section title. */
  processLabel: string
  /** Final results Anticipate section title. */
  anticipateLabel: string
  /** Section 2 — Observe activity id. */
  seeActivityId: string
  /** Section 3 — Process activity id. */
  processActivityId: string
  /** Section 4 — Anticipate activity id. */
  anticipateActivityId: string
}

export function isInroadsMvpActivity(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(INROADS_MVP_TAG)
}

export function isInroadsMvpChildActivity(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(INROADS_MVP_CHILD_TAG)
}

export function createDefaultInroadsMvpDefinition(
  seeActivityId: string,
  processActivityId: string,
  anticipateActivityId: string,
): InroadsMvpDefinition {
  return {
    version: 1,
    introMedia: null,
    introShowOnFirstVisitOnly: true,
    introductionActivityId: '',
    country: 'Canada',
    language: 'English',
    buttonLabel: '',
    submitLabel: '',
    challengePassedLabel: '',
    challengeFailedLabel: '',
    maneuverLabel: '',
    roadwayLabel: '',
    trafficDensityLabel: '',
    timeOfDayLabel: '',
    roadConditionsLabel: '',
    ptsLabel: '',
    detectionLabel: '',
    accuracyLabel: '',
    coachingLabel: '',
    q1Label: '',
    q2Label: '',
    q3Label: '',
    q4Label: '',
    observeLabel: '',
    processLabel: '',
    anticipateLabel: '',
    seeActivityId,
    processActivityId,
    anticipateActivityId,
  }
}

export function cloneInroadsMvpDefinition(
  definition: InroadsMvpDefinition,
): InroadsMvpDefinition {
  return {
    version: 1,
    introMedia: definition.introMedia
      ? { media_asset_id: definition.introMedia.media_asset_id }
      : null,
    introShowOnFirstVisitOnly: definition.introShowOnFirstVisitOnly !== false,
    introductionActivityId: definition.introductionActivityId.trim(),
    country: canonicalizeLessonCountry(definition.country),
    language: canonicalizeLessonLanguage(definition.language),
    buttonLabel: definition.buttonLabel.trim(),
    submitLabel: definition.submitLabel.trim(),
    challengePassedLabel: definition.challengePassedLabel.trim(),
    challengeFailedLabel: definition.challengeFailedLabel.trim(),
    maneuverLabel: definition.maneuverLabel.trim(),
    roadwayLabel: definition.roadwayLabel.trim(),
    trafficDensityLabel: definition.trafficDensityLabel.trim(),
    timeOfDayLabel: definition.timeOfDayLabel.trim(),
    roadConditionsLabel: definition.roadConditionsLabel.trim(),
    ptsLabel: definition.ptsLabel.trim(),
    detectionLabel: definition.detectionLabel.trim(),
    accuracyLabel: definition.accuracyLabel.trim(),
    coachingLabel: definition.coachingLabel.trim(),
    q1Label: definition.q1Label.trim(),
    q2Label: definition.q2Label.trim(),
    q3Label: definition.q3Label.trim(),
    q4Label: definition.q4Label.trim(),
    observeLabel: definition.observeLabel.trim(),
    processLabel: definition.processLabel.trim(),
    anticipateLabel: definition.anticipateLabel.trim(),
    seeActivityId: definition.seeActivityId,
    processActivityId: definition.processActivityId,
    anticipateActivityId: definition.anticipateActivityId,
  }
}

export function normalizeInroadsMvpDefinition(
  raw: Partial<InroadsMvpDefinition> | null | undefined,
): InroadsMvpDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const seeActivityId =
    typeof raw.seeActivityId === 'string' ? raw.seeActivityId.trim() : ''
  const processActivityId =
    typeof raw.processActivityId === 'string' ? raw.processActivityId.trim() : ''
  const anticipateActivityId =
    typeof raw.anticipateActivityId === 'string' ? raw.anticipateActivityId.trim() : ''
  if (!seeActivityId || !processActivityId || !anticipateActivityId) return null

  const introRaw = raw.introMedia
  let introMedia: MediaRef | null = null
  if (introRaw && typeof introRaw === 'object') {
    const id = (introRaw as { media_asset_id?: unknown }).media_asset_id
    if (typeof id === 'string' && id.trim()) {
      introMedia = { media_asset_id: id.trim() }
    }
  }

  return {
    version: 1,
    introMedia,
    introShowOnFirstVisitOnly: raw.introShowOnFirstVisitOnly !== false,
    introductionActivityId:
      typeof raw.introductionActivityId === 'string' ? raw.introductionActivityId.trim() : '',
    country: canonicalizeLessonCountry(
      typeof raw.country === 'string' ? raw.country : '',
    ),
    language: canonicalizeLessonLanguage(
      typeof raw.language === 'string' ? raw.language : '',
    ),
    buttonLabel: typeof raw.buttonLabel === 'string' ? raw.buttonLabel.trim() : '',
    submitLabel: typeof raw.submitLabel === 'string' ? raw.submitLabel.trim() : '',
    challengePassedLabel:
      typeof raw.challengePassedLabel === 'string' ? raw.challengePassedLabel.trim() : '',
    challengeFailedLabel:
      typeof raw.challengeFailedLabel === 'string' ? raw.challengeFailedLabel.trim() : '',
    maneuverLabel: typeof raw.maneuverLabel === 'string' ? raw.maneuverLabel.trim() : '',
    roadwayLabel: typeof raw.roadwayLabel === 'string' ? raw.roadwayLabel.trim() : '',
    trafficDensityLabel:
      typeof raw.trafficDensityLabel === 'string' ? raw.trafficDensityLabel.trim() : '',
    timeOfDayLabel: typeof raw.timeOfDayLabel === 'string' ? raw.timeOfDayLabel.trim() : '',
    roadConditionsLabel:
      typeof raw.roadConditionsLabel === 'string' ? raw.roadConditionsLabel.trim() : '',
    ptsLabel: typeof raw.ptsLabel === 'string' ? raw.ptsLabel.trim() : '',
    detectionLabel: typeof raw.detectionLabel === 'string' ? raw.detectionLabel.trim() : '',
    accuracyLabel: typeof raw.accuracyLabel === 'string' ? raw.accuracyLabel.trim() : '',
    coachingLabel: typeof raw.coachingLabel === 'string' ? raw.coachingLabel.trim() : '',
    q1Label: typeof raw.q1Label === 'string' ? raw.q1Label.trim() : '',
    q2Label: typeof raw.q2Label === 'string' ? raw.q2Label.trim() : '',
    q3Label: typeof raw.q3Label === 'string' ? raw.q3Label.trim() : '',
    q4Label: typeof raw.q4Label === 'string' ? raw.q4Label.trim() : '',
    observeLabel: typeof raw.observeLabel === 'string' ? raw.observeLabel.trim() : '',
    processLabel: typeof raw.processLabel === 'string' ? raw.processLabel.trim() : '',
    anticipateLabel: typeof raw.anticipateLabel === 'string' ? raw.anticipateLabel.trim() : '',
    seeActivityId,
    processActivityId,
    anticipateActivityId,
  }
}

export const INROADS_MVP_SECTIONS = [
  { id: 'lesson', label: 'Lesson' },
  { id: 'see', label: '1 · Observe' },
  { id: 'process', label: '2 · Process' },
  { id: 'anticipate', label: '3 · Anticipate' },
] as const

export type InroadsMvpSectionId = (typeof INROADS_MVP_SECTIONS)[number]['id']
