import { cloneJson } from '@/app/clone'
import {
  clampHazardRadius,
  DEFAULT_HAZARD_RADIUS,
} from '@/lib/hazards/constants'
import { MIN_HAZARD_DURATION } from '@/lib/timeline/format'
import { getInroadsScoringPoints } from '@/services/inroadsScoring'
import { inroadsQuestionBankMaxPoints } from '@/types/inroadsScoring'
import type { MediaRef } from '@/types/media'
import {
  defaultHazardDetails,
  hazardTriggerTrajectories,
  hazardWindowFromTriggers,
  type HazardDetails,
  type HazardSeverity,
  type TrajectoryPoint,
} from '@/types/hazard'
import {
  emptyQuestionBank,
  readQuestionBank,
  type ProcessQuestionBank,
} from '@/types/questions'

export const SEE_TAG = 'see'
export const SEE_NODE_TYPE = 'see.hazard'
export const DEFAULT_SEE_INSTRUCTION_PILL = 'Observe'
export const DEFAULT_SEE_INSTRUCTION =
  'Watch the following video and tap hazards as they develop.'

export type ObserveHazardOutcome =
  | 'success_first_attempt'
  | 'success_second_attempt'
  | 'success_third_attempt'
  | 'failed_max_attempts'
  | 'failed_timeout_zero'
  | 'failed_timeout_one'
  | 'failed_timeout_two'

export type ObserveResultCopy = {
  successResult: string
  failScreen: string
  twoAttempts: string
  threeAttempts: string
  timeOut: string
  missed1Attempt: string
  missed2Attempt: string
}

export const DEFAULT_OBSERVE_RESULT_COPY: ObserveResultCopy = {
  successResult: 'NO COACHING NEEDED',
  failScreen: 'COACHING REQUIRED',
  twoAttempts: 'You got it on your second attempt. ',
  threeAttempts: 'You found it, but it took 3 attempts. ',
  timeOut: 'Time ran out before you attempted anything. ',
  missed1Attempt: 'You attempted once, but time ran out before you found it. ',
  missed2Attempt: 'You tried twice and time ran out. ',
}

export function resolveObserveHazardOutcome(params: {
  correct: boolean
  attempts?: number
  missReason?: 'attempts' | 'time'
  tapsBeforeMiss?: number
}): ObserveHazardOutcome {
  if (params.correct) {
    const attempts = params.attempts ?? 1
    if (attempts <= 1) return 'success_first_attempt'
    if (attempts === 2) return 'success_second_attempt'
    return 'success_third_attempt'
  }
  if (params.missReason === 'attempts') return 'failed_max_attempts'
  const taps = params.tapsBeforeMiss ?? 0
  if (taps <= 0) return 'failed_timeout_zero'
  if (taps === 1) return 'failed_timeout_one'
  return 'failed_timeout_two'
}

export function observeResultSubtext(
  outcome: ObserveHazardOutcome,
  copy: ObserveResultCopy,
): string | null {
  switch (outcome) {
    case 'success_first_attempt':
    case 'failed_max_attempts':
      return null
    case 'success_second_attempt':
      return copy.twoAttempts
    case 'success_third_attempt':
      return copy.threeAttempts
    case 'failed_timeout_zero':
      return copy.timeOut
    case 'failed_timeout_one':
      return copy.missed1Attempt
    case 'failed_timeout_two':
      return copy.missed2Attempt
  }
}

export function observeResultHeading(
  outcome: ObserveHazardOutcome,
  copy: ObserveResultCopy,
): string {
  return outcome === 'success_first_attempt' ? copy.successResult : copy.failScreen
}

function readObserveResultCopy(value: unknown): ObserveResultCopy {
  const raw = value && typeof value === 'object' ? (value as Partial<ObserveResultCopy>) : {}
  return {
    successResult:
      typeof raw.successResult === 'string' && raw.successResult.trim()
        ? raw.successResult
        : DEFAULT_OBSERVE_RESULT_COPY.successResult,
    failScreen:
      typeof raw.failScreen === 'string' && raw.failScreen.trim()
        ? raw.failScreen
        : DEFAULT_OBSERVE_RESULT_COPY.failScreen,
    twoAttempts:
      typeof raw.twoAttempts === 'string' ? raw.twoAttempts : DEFAULT_OBSERVE_RESULT_COPY.twoAttempts,
    threeAttempts:
      typeof raw.threeAttempts === 'string'
        ? raw.threeAttempts
        : DEFAULT_OBSERVE_RESULT_COPY.threeAttempts,
    timeOut: typeof raw.timeOut === 'string' ? raw.timeOut : DEFAULT_OBSERVE_RESULT_COPY.timeOut,
    missed1Attempt:
      typeof raw.missed1Attempt === 'string'
        ? raw.missed1Attempt
        : DEFAULT_OBSERVE_RESULT_COPY.missed1Attempt,
    missed2Attempt:
      typeof raw.missed2Attempt === 'string'
        ? raw.missed2Attempt
        : DEFAULT_OBSERVE_RESULT_COPY.missed2Attempt,
  }
}

export interface SeeHazard extends HazardDetails {
  id: string
  startTime: number
  endTime: number
  trajectory: TrajectoryPoint[]
  extraTrajectories?: TrajectoryPoint[][]
  radius: number
  explanation: string
  explanationImage: MediaRef | null
  missedVideo: MediaRef | null
  /** Plays at the start of the hazard clip while the summary card is shown. */
  introAudio: MediaRef | null
  maneuver: string
  roadway: string
  trafficDensity: string
  timeOfDay: string
  roadConditions: string
  instructionText: string
  instructionPill: string
  questions: ProcessQuestionBank
}

export type HazardClipSummary = {
  maneuver: string
  roadway: string
  trafficDensity: string
  timeOfDay: string
  roadConditions: string
}

export function hazardClipSummary(
  source: Partial<HazardClipSummary> | null | undefined,
): HazardClipSummary {
  return {
    maneuver: typeof source?.maneuver === 'string' ? source.maneuver : '',
    roadway: typeof source?.roadway === 'string' ? source.roadway : '',
    trafficDensity: typeof source?.trafficDensity === 'string' ? source.trafficDensity : '',
    timeOfDay: typeof source?.timeOfDay === 'string' ? source.timeOfDay : '',
    roadConditions: typeof source?.roadConditions === 'string' ? source.roadConditions : '',
  }
}

function summaryHasContent(summary: HazardClipSummary): boolean {
  return Boolean(
    summary.maneuver.trim() ||
      summary.roadway.trim() ||
      summary.trafficDensity.trim() ||
      summary.timeOfDay.trim() ||
      summary.roadConditions.trim(),
  )
}

export interface SeeDefinition {
  version: 1
  duration: number
  media: MediaRef | null
  /** Shown over the paused first frame of the scenario video. Empty skips the overlay. */
  instructionText: string
  /** Pill label on the scenario instruction card. Empty uses "Observe". */
  instructionPill: string
  /** Plays after the instruction card and before the scenario video. */
  introAudio: MediaRef | null
  maneuver: string
  roadway: string
  trafficDensity: string
  timeOfDay: string
  roadConditions: string
  hazards: SeeHazard[]
  /** Copy for the Observe hazard results screen (imported from lesson.xlsx). */
  resultCopy: ObserveResultCopy
}

const TRIGGER_OFFSETS = [
  { x: -12, y: 0 },
  { x: 12, y: 0 },
  { x: 0, y: -12 },
  { x: 0, y: 12 },
] as const

export function createDefaultTrajectory(
  startTime: number,
  endTime: number,
  radius: number = DEFAULT_HAZARD_RADIUS,
  position: { x: number; y: number } = { x: 50, y: 50 },
): TrajectoryPoint[] {
  const r = clampHazardRadius(radius)
  return [
    { time: startTime, x: position.x, y: position.y, radius: r },
    { time: endTime, x: position.x, y: position.y, radius: r },
  ]
}

export function createExtraTriggerTrajectory(
  startTime: number,
  endTime: number,
  radius: number,
  existingCount: number,
  origin?: { x: number; y: number; radius?: number },
): TrajectoryPoint[] {
  const offset = TRIGGER_OFFSETS[(Math.max(1, existingCount) - 1) % TRIGGER_OFFSETS.length] ?? {
    x: -12,
    y: 0,
  }
  const r = clampHazardRadius(origin?.radius ?? radius)
  const x = Math.min(100, Math.max(0, (origin?.x ?? 50) + offset.x))
  const y = Math.min(100, Math.max(0, (origin?.y ?? 50) + offset.y))
  return createDefaultTrajectory(startTime, endTime, r, { x, y })
}

function cloneTrajectory(trajectory: TrajectoryPoint[]): TrajectoryPoint[] {
  return trajectory.map((point) => ({ ...point }))
}

export function applyHazardTriggerTrajectory(
  hazard: SeeHazard,
  triggerIndex: number,
  trajectory: TrajectoryPoint[],
): Partial<SeeHazard> {
  const all = hazardTriggerTrajectories(hazard).map(cloneTrajectory)
  const index = Math.max(0, triggerIndex)
  const next = cloneTrajectory(trajectory)
  if (all.length === 0) return { trajectory: next }
  if (index >= all.length) all.push(next)
  else all[index] = next
  const [primary, ...extras] = all
  const applied = {
    trajectory: primary ?? next,
    extraTrajectories: extras.length > 0 ? extras : undefined,
  }
  const union = hazardWindowFromTriggers({ ...hazard, ...applied })
  return { ...applied, startTime: union.startTime, endTime: union.endTime }
}

export function applyTriggerTimes(
  hazard: SeeHazard,
  triggerIndex: number,
  startTime: number,
  endTime: number,
): Partial<SeeHazard> {
  const current =
    hazardTriggerTrajectories(hazard)[Math.max(0, triggerIndex)] ?? hazard.trajectory
  return applyHazardTriggerTrajectory(
    hazard,
    triggerIndex,
    adjustTrajectoryTimes(current, startTime, endTime),
  )
}

export function appendTriggerAtPlayhead(
  hazard: SeeHazard,
  currentTime: number,
  videoDuration: number,
  origin?: { x: number; y: number; radius?: number },
): Partial<SeeHazard> {
  const extras = [...(hazard.extraTrajectories ?? [])].map(cloneTrajectory)
  const startTime = Math.max(0, currentTime)
  const limit = videoDuration > 0 ? videoDuration : startTime + 2
  const endTime = Math.min(limit, startTime + 2)
  const safeEnd =
    endTime <= startTime ? Math.min(limit, startTime + MIN_HAZARD_DURATION) : endTime
  extras.push(
    createExtraTriggerTrajectory(
      startTime,
      safeEnd,
      hazard.radius,
      extras.length + 1,
      origin,
    ),
  )
  const applied = { extraTrajectories: extras }
  const union = hazardWindowFromTriggers({ ...hazard, ...applied })
  return { ...applied, startTime: union.startTime, endTime: union.endTime }
}

export function removeHazardTrigger(
  hazard: SeeHazard,
  triggerIndex: number,
): Partial<SeeHazard> | null {
  const extras = [...(hazard.extraTrajectories ?? [])]
  let applied: Partial<SeeHazard>
  if (triggerIndex <= 0) {
    const [promoted, ...rest] = extras
    if (!promoted) return null
    applied = { trajectory: promoted, extraTrajectories: rest }
  } else {
    if (!extras[triggerIndex - 1]) return null
    extras.splice(triggerIndex - 1, 1)
    applied = { extraTrajectories: extras }
  }
  const union = hazardWindowFromTriggers({ ...hazard, ...applied })
  return { ...applied, startTime: union.startTime, endTime: union.endTime }
}

export function fitTrajectoryToWindow(
  trajectory: TrajectoryPoint[],
  startTime: number,
  endTime: number,
  radius: number = DEFAULT_HAZARD_RADIUS,
): TrajectoryPoint[] {
  const sorted = [...trajectory].sort((a, b) => a.time - b.time)
  if (sorted.length === 0) return createDefaultTrajectory(startTime, endTime, radius)
  if (sorted.length === 1) {
    const point = sorted[0]
    if (!point) return createDefaultTrajectory(startTime, endTime, radius)
    return [
      { ...point, time: startTime },
      { time: endTime, x: point.x, y: point.y, radius: point.radius },
    ]
  }
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) return createDefaultTrajectory(startTime, endTime, radius)
  const middle = sorted
    .slice(1, -1)
    .filter((point) => point.time >= startTime && point.time <= endTime)
  return [{ ...first, time: startTime }, ...middle, { ...last, time: endTime }]
}

export function adjustTrajectoryTimes(
  trajectory: TrajectoryPoint[],
  startTime: number,
  endTime: number,
): TrajectoryPoint[] {
  if (trajectory.length === 0) {
    return createDefaultTrajectory(startTime, endTime)
  }

  if (trajectory.length === 1) {
    const point = trajectory[0]
    if (!point) return createDefaultTrajectory(startTime, endTime)
    return [
      { ...point, time: startTime },
      { time: endTime, x: point.x, y: point.y, radius: point.radius },
    ]
  }

  const sorted = [...trajectory].sort((a, b) => a.time - b.time)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) return createDefaultTrajectory(startTime, endTime)
  const oldSpan = last.time - first.time
  const nextSpan = endTime - startTime

  return sorted.map((point, index) => {
    if (index === 0) return { ...point, time: startTime }
    if (index === sorted.length - 1) return { ...point, time: endTime }
    const t = oldSpan <= 0 ? index / (sorted.length - 1) : (point.time - first.time) / oldSpan
    return { ...point, time: startTime + t * nextSpan }
  })
}

export function createEmptySeeHazard(
  index = 1,
  currentTime = 0,
  duration = 10,
  radius = DEFAULT_HAZARD_RADIUS,
): SeeHazard {
  const startTime = Math.max(0, currentTime)
  const endTime = Math.min(duration, startTime + 2)
  const safeEnd =
    endTime <= startTime ? Math.min(duration, startTime + MIN_HAZARD_DURATION) : endTime
  const nextRadius = clampHazardRadius(radius)

  return {
    id: crypto.randomUUID(),
    startTime,
    endTime: safeEnd,
    trajectory: createDefaultTrajectory(startTime, safeEnd, nextRadius),
    radius: nextRadius,
    name: `Hazard ${index}`,
    hazardType: '',
    severity: defaultHazardDetails.severity,
    notes: '',
    explanation: '',
    explanationImage: null,
    missedVideo: null,
    introAudio: null,
    maneuver: '',
    roadway: '',
    trafficDensity: '',
    timeOfDay: '',
    roadConditions: '',
    instructionText: '',
    instructionPill: DEFAULT_SEE_INSTRUCTION_PILL,
    questions: emptyQuestionBank(),
  }
}

export function createDefaultSeeDefinition(): SeeDefinition {
  return {
    version: 1,
    duration: 0,
    media: null,
    instructionText: DEFAULT_SEE_INSTRUCTION,
    instructionPill: DEFAULT_SEE_INSTRUCTION_PILL,
    introAudio: null,
    maneuver: '',
    roadway: '',
    trafficDensity: '',
    timeOfDay: '',
    roadConditions: '',
    hazards: [],
    resultCopy: { ...DEFAULT_OBSERVE_RESULT_COPY },
  }
}

export function cloneSeeDefinition(definition: SeeDefinition): SeeDefinition {
  return cloneJson(definition)
}

function readMediaRef(value: unknown): MediaRef | null {
  if (!value || typeof value !== 'object') return null
  const id = (value as MediaRef).media_asset_id
  return typeof id === 'string' && id ? { media_asset_id: id } : null
}

function readTrajectory(value: unknown): TrajectoryPoint[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Partial<TrajectoryPoint>
      if (typeof raw.time !== 'number' || typeof raw.x !== 'number' || typeof raw.y !== 'number') {
        return null
      }
      const point: TrajectoryPoint = { time: raw.time, x: raw.x, y: raw.y }
      if (typeof raw.radius === 'number' && Number.isFinite(raw.radius)) {
        point.radius = clampHazardRadius(raw.radius)
      }
      return point
    })
    .filter((item): item is TrajectoryPoint => item !== null)
}

function readSeverity(value: unknown): HazardSeverity {
  return value === 'low' || value === 'high' ? value : 'medium'
}

export function normalizeSeeHazard(hazard: Partial<SeeHazard> | undefined): SeeHazard {
  const radius = clampHazardRadius(hazard?.radius ?? DEFAULT_HAZARD_RADIUS)
  const fallbackStart = typeof hazard?.startTime === 'number' ? Math.max(0, hazard.startTime) : 0
  const fallbackEnd =
    typeof hazard?.endTime === 'number'
      ? Math.max(fallbackStart + MIN_HAZARD_DURATION, hazard.endTime)
      : fallbackStart + 2
  let trajectory = readTrajectory(hazard?.trajectory)
  const extras = (Array.isArray(hazard?.extraTrajectories) ? hazard.extraTrajectories : [])
    .map((item) => readTrajectory(item))
    .filter((item) => item.length >= 2)
  if (trajectory.length < 2) {
    trajectory = createDefaultTrajectory(fallbackStart, fallbackEnd, radius)
  }
  const union = hazardWindowFromTriggers({
    startTime: fallbackStart,
    endTime: fallbackEnd,
    trajectory,
    extraTrajectories: extras,
  })
  return {
    id: hazard?.id || crypto.randomUUID(),
    startTime: union.startTime,
    endTime: Math.max(union.endTime, union.startTime + MIN_HAZARD_DURATION),
    trajectory,
    extraTrajectories: extras.length > 0 ? extras : undefined,
    radius,
    name: typeof hazard?.name === 'string' ? hazard.name : '',
    hazardType: typeof hazard?.hazardType === 'string' ? hazard.hazardType : '',
    severity: readSeverity(hazard?.severity),
    notes: typeof hazard?.notes === 'string' ? hazard.notes : '',
    explanation:
      typeof hazard?.explanation === 'string'
        ? hazard.explanation
        : typeof hazard?.notes === 'string'
          ? hazard.notes
          : '',
    explanationImage: readMediaRef(hazard?.explanationImage),
    missedVideo: readMediaRef(hazard?.missedVideo),
    introAudio: readMediaRef(hazard?.introAudio),
    maneuver: typeof hazard?.maneuver === 'string' ? hazard.maneuver : '',
    roadway: typeof hazard?.roadway === 'string' ? hazard.roadway : '',
    trafficDensity: typeof hazard?.trafficDensity === 'string' ? hazard.trafficDensity : '',
    timeOfDay: typeof hazard?.timeOfDay === 'string' ? hazard.timeOfDay : '',
    roadConditions: typeof hazard?.roadConditions === 'string' ? hazard.roadConditions : '',
    instructionText: typeof hazard?.instructionText === 'string' ? hazard.instructionText : '',
    instructionPill:
      typeof hazard?.instructionPill === 'string' && hazard.instructionPill.trim()
        ? hazard.instructionPill
        : DEFAULT_SEE_INSTRUCTION_PILL,
    questions: readQuestionBank(hazard?.questions),
  }
}

export function normalizeSeeDefinition(definition: SeeDefinition): SeeDefinition {
  const hazards = (definition.hazards ?? []).map((hazard) => normalizeSeeHazard(hazard))
  const first = hazards[0]
  const fromDefinition = hazardClipSummary(definition)
  const fromHazard = hazardClipSummary(first)
  const summary = summaryHasContent(fromDefinition) ? fromDefinition : fromHazard
  return {
    version: 1,
    duration: typeof definition.duration === 'number' && definition.duration > 0 ? definition.duration : 0,
    media: readMediaRef(definition.media),
    instructionText:
      typeof definition.instructionText === 'string'
        ? definition.instructionText
        : DEFAULT_SEE_INSTRUCTION,
    instructionPill:
      typeof definition.instructionPill === 'string'
        ? definition.instructionPill
        : DEFAULT_SEE_INSTRUCTION_PILL,
    introAudio: readMediaRef(definition.introAudio) ?? readMediaRef(first?.introAudio),
    ...summary,
    hazards: hazards.sort((a, b) => a.startTime - b.startTime),
    resultCopy: readObserveResultCopy(definition.resultCopy),
  }
}

export function seeMaxScore(definition: SeeDefinition): number {
  const points = getInroadsScoringPoints()
  const hitPoints = definition.hazards.length
  const questionPoints = definition.hazards.reduce(
    (sum, hazard) => sum + inroadsQuestionBankMaxPoints(points, 'observe', 1, hazard.questions),
    0,
  )
  return hitPoints + questionPoints
}

export function isSeeActivity(tags: string[] | undefined): boolean {
  return Boolean(tags?.includes(SEE_TAG))
}
