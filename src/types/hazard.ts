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
  radius?: number
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
