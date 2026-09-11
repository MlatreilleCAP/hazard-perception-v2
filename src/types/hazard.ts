export type TrajectoryPoint = {
  time: number
  x: number
  y: number
  radius?: number
}

export type Hazard = {
  id: string
  startTime: number
  endTime: number
  trajectory: TrajectoryPoint[]
  /** Extra tap zones for the same hazard. Any zone hit counts as a success. */
  extraTrajectories?: TrajectoryPoint[][]
  radius?: number
}

export function hazardTriggerTrajectories(hazard: {
  trajectory: TrajectoryPoint[]
  extraTrajectories?: TrajectoryPoint[][]
}): TrajectoryPoint[][] {
  const primary = Array.isArray(hazard.trajectory) ? hazard.trajectory : []
  const extras = (Array.isArray(hazard.extraTrajectories) ? hazard.extraTrajectories : []).filter(
    (item) => Array.isArray(item) && item.length > 0,
  )
  return primary.length > 0 ? [primary, ...extras] : extras
}

export function trajectoryWindow(
  trajectory: TrajectoryPoint[],
): { startTime: number; endTime: number } | null {
  let startTime = Infinity
  let endTime = -Infinity
  for (const point of trajectory) {
    if (!Number.isFinite(point.time)) continue
    if (point.time < startTime) startTime = point.time
    if (point.time > endTime) endTime = point.time
  }
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null
  return { startTime, endTime }
}

export function hazardWindowFromTriggers(hazard: {
  id?: string
  startTime: number
  endTime: number
  trajectory: TrajectoryPoint[]
  extraTrajectories?: TrajectoryPoint[][]
}): { startTime: number; endTime: number } {
  let startTime = Infinity
  let endTime = -Infinity
  for (const trajectory of hazardTriggerTrajectories(hazard)) {
    const window = trajectoryWindow(trajectory)
    if (!window) continue
    startTime = Math.min(startTime, window.startTime)
    endTime = Math.max(endTime, window.endTime)
  }
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return { startTime: hazard.startTime, endTime: hazard.endTime }
  }
  return { startTime, endTime }
}

export const HAZARD_SEVERITIES = ['low', 'medium', 'high'] as const
export type HazardSeverity = (typeof HAZARD_SEVERITIES)[number]

export const CORE_COMPETENCIES = [
  'Attitude',
  'Speed Management',
  'Space Management',
  'Danger Zones',
  'Scanning',
  'Other Motorists',
] as const

export type CoreCompetency = (typeof CORE_COMPETENCIES)[number]

export type HazardDetails = {
  name: string
  hazardType: string
  severity: HazardSeverity
  notes: string
}

export const defaultHazardDetails: HazardDetails = {
  name: '',
  hazardType: '',
  severity: 'medium',
  notes: '',
}

export function isCoreCompetency(value: string): value is CoreCompetency {
  return (CORE_COMPETENCIES as readonly string[]).includes(value)
}

export function hazardDetailsLabel(details: HazardDetails, fallback: string): string {
  return details.name.trim() || fallback
}

export function formatHazardSeverity(severity: HazardSeverity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}
