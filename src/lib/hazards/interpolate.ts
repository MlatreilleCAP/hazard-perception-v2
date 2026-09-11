import {
  clampHazardRadius,
  DEFAULT_HAZARD_RADIUS,
} from '@/lib/hazards/constants'
import { hazardTriggerTrajectories, trajectoryWindow, type Hazard, type TrajectoryPoint } from '@/types/hazard'

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

function sortedTrajectory(trajectory: TrajectoryPoint[]): TrajectoryPoint[] {
  return [...trajectory].sort((a, b) => a.time - b.time)
}

export function interpolateTrajectoryAtTime(
  hazard: Hazard,
  trajectory: TrajectoryPoint[],
  currentTime: number,
  options?: { ignoreStartTime?: boolean },
): HazardState | null {
  const points = sortedTrajectory(trajectory)
  if (points.length === 0) return null
  const window = trajectoryWindow(points) ?? {
    startTime: hazard.startTime,
    endTime: hazard.endTime,
  }
  const beforeStart = !options?.ignoreStartTime && currentTime < window.startTime - 0.05
  if (beforeStart || currentTime > window.endTime + 0.05) {
    return null
  }

  if (points.length === 1) {
    const point = points[0]
    if (!point) return null
    return { x: point.x, y: point.y, radius: resolvePointRadius(point, hazard) }
  }

  const first = points[0]
  if (first && currentTime <= first.time) {
    return {
      x: first.x,
      y: first.y,
      radius: resolvePointRadius(first, hazard),
    }
  }

  const last = points[points.length - 1]
  if (last && currentTime >= last.time) {
    return {
      x: last.x,
      y: last.y,
      radius: resolvePointRadius(last, hazard),
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    if (currentTime >= a.time && currentTime <= b.time) {
      return interpolateSegment(a, b, hazard, currentTime)
    }
  }

  if (!first) return null
  let nearest = first
  let nearestDist = Math.abs(currentTime - first.time)
  for (const point of points) {
    const dist = Math.abs(currentTime - point.time)
    if (dist < nearestDist) {
      nearest = point
      nearestDist = dist
    }
  }
  return { x: nearest.x, y: nearest.y, radius: resolvePointRadius(nearest, hazard) }
}

export function getHazardStateAtTime(
  hazard: Hazard,
  currentTime: number,
): HazardState | null {
  return interpolateTrajectoryAtTime(hazard, hazard.trajectory, currentTime)
}

export function getHazardStatesAtTime(
  hazard: Hazard,
  currentTime: number,
): HazardState[] {
  const states: HazardState[] = []
  const seen = new Set<string>()
  const add = (state: HazardState) => {
    const key = `${state.x.toFixed(2)}:${state.y.toFixed(2)}:${state.radius.toFixed(2)}`
    if (seen.has(key)) return
    seen.add(key)
    states.push(state)
  }

  for (const trajectory of hazardTriggerTrajectories(hazard)) {
    const interpolated = interpolateTrajectoryAtTime(hazard, trajectory, currentTime)
    if (interpolated) add(interpolated)
  }

  return states
}
