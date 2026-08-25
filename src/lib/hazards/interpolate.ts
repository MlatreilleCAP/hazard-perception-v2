import {
  clampHazardRadius,
  DEFAULT_HAZARD_RADIUS,
} from '@/lib/hazards/constants'
import type { Hazard, TrajectoryPoint } from '@/types/hazard'

export type HazardState = { x: number; y: number; radius: number }

function resolvePointRadius(point: TrajectoryPoint, hazard: Hazard): number {
  return clampHazardRadius(point.radius ?? hazard.radius ?? DEFAULT_HAZARD_RADIUS)
}

function interpolateSegment(
  a: TrajectoryPoint,
  b: TrajectoryPoint,
  hazard: Hazard,
  currentTime: number,
): HazardState {
  const span = b.time - a.time
  const t = span === 0 ? 0 : (currentTime - a.time) / span
  const radiusA = resolvePointRadius(a, hazard)
  const radiusB = resolvePointRadius(b, hazard)

  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    radius: radiusA + (radiusB - radiusA) * t,
  }
}

export function getHazardStateAtTime(
  hazard: Hazard,
  currentTime: number,
): HazardState | null {
  const { trajectory } = hazard

  if (trajectory.length === 0) return null
  if (currentTime < hazard.startTime || currentTime > hazard.endTime) {
    return null
  }

  if (trajectory.length === 1) {
    const point = trajectory[0]
    if (!point) return null
    return { x: point.x, y: point.y, radius: resolvePointRadius(point, hazard) }
  }

  const first = trajectory[0]
  if (first && currentTime <= first.time) {
    return {
      x: first.x,
      y: first.y,
      radius: resolvePointRadius(first, hazard),
    }
  }

  const last = trajectory[trajectory.length - 1]
  if (last && currentTime >= last.time) {
    return {
      x: last.x,
      y: last.y,
      radius: resolvePointRadius(last, hazard),
    }
  }

  for (let i = 0; i < trajectory.length - 1; i++) {
    const a = trajectory[i]
    const b = trajectory[i + 1]
    if (!a || !b) continue
    if (currentTime >= a.time && currentTime <= b.time) {
      return interpolateSegment(a, b, hazard, currentTime)
    }
  }

  return null
}
