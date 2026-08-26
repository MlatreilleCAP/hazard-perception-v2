import { cloneJson } from '@/app/clone'
import {
  clampHazardRadius,
  DEFAULT_HAZARD_RADIUS,
} from '@/lib/hazards/constants'
import { MIN_HAZARD_DURATION } from '@/lib/timeline/format'
import type { MediaRef } from '@/types/media'
import {
  defaultHazardDetails,
  type HazardDetails,
  type HazardSeverity,
  type TrajectoryPoint,
} from '@/types/hazard'
import {
  emptyQuestionBank,
  questionBankMaxPoints,
  readQuestionBank,
  type ProcessQuestionBank,
} from '@/types/questions'

export const SEE_TAG = 'see'
export const SEE_NODE_TYPE = 'see.hazard'
export const DEFAULT_SEE_INSTRUCTION_PILL = 'Observe'
export const DEFAULT_SEE_INSTRUCTION =
  'Watch the following video and tap hazards as they develop.'

export interface SeeHazard extends HazardDetails {
  id: string
  startTime: number
  endTime: number
  trajectory: TrajectoryPoint[]
  radius: number
  explanation: string
  explanationImage: MediaRef | null
  missedVideo: MediaRef | null
  instructionText: string
  instructionPill: string
  questions: ProcessQuestionBank
}

export interface SeeDefinition {
  version: 1
  duration: number
  media: MediaRef | null
  /** Shown over the paused first frame of the scenario video. Empty skips the overlay. */
  instructionText: string
  /** Pill label on the scenario instruction card. Empty uses "Observe". */
  instructionPill: string
  hazards: SeeHazard[]
}

export function createDefaultTrajectory(
  startTime: number,
  endTime: number,
  radius: number = DEFAULT_HAZARD_RADIUS,
): TrajectoryPoint[] {
  const r = clampHazardRadius(radius)
  return [
    { time: startTime, x: 50, y: 50, radius: r },
    { time: endTime, x: 50, y: 50, radius: r },
  ]
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

  return trajectory.map((point, index) => {
    if (index === 0) return { ...point, time: startTime }
    if (index === trajectory.length - 1) return { ...point, time: endTime }
    return point
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
    hazards: [],
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
  const startTime = typeof hazard?.startTime === 'number' ? Math.max(0, hazard.startTime) : 0
  const endTime =
    typeof hazard?.endTime === 'number'
      ? Math.max(startTime + MIN_HAZARD_DURATION, hazard.endTime)
      : startTime + 2
  const radius = clampHazardRadius(hazard?.radius ?? DEFAULT_HAZARD_RADIUS)
  const trajectory = readTrajectory(hazard?.trajectory)
  return {
    id: hazard?.id || crypto.randomUUID(),
    startTime,
    endTime,
    trajectory: trajectory.length >= 2 ? trajectory : createDefaultTrajectory(startTime, endTime, radius),
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
    hazards: hazards.sort((a, b) => a.startTime - b.startTime),
  }
}

export function seeMaxScore(definition: SeeDefinition): number {
  const hitPoints = definition.hazards.length
  const questionPoints = definition.hazards.reduce(
    (sum, hazard) => sum + questionBankMaxPoints(hazard.questions),
    0,
  )
  return hitPoints + questionPoints
}

export function isSeeActivity(tags: string[] | undefined): boolean {
  return Boolean(tags?.includes(SEE_TAG))
}
