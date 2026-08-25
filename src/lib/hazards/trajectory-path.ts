import { clampHazardRadius } from '@/lib/hazards/constants'
import { getHazardStateAtTime } from '@/lib/hazards/interpolate'
import type { Hazard, TrajectoryPoint } from '@/types/hazard'

export function sortTrajectory(trajectory: TrajectoryPoint[]): TrajectoryPoint[] {
  return [...trajectory].sort((a, b) => a.time - b.time)
}

export function clampTrajectoryTime(
  time: number,
  startTime: number,
  endTime: number,
): number {
  return Math.min(endTime, Math.max(startTime, time))
}

export function addTrajectoryPoint(
  trajectory: TrajectoryPoint[],
  point: TrajectoryPoint,
  startTime: number,
  endTime: number,
): TrajectoryPoint[] {
  const time = clampTrajectoryTime(point.time, startTime, endTime)
  const next = trajectory.filter((item) => Math.abs(item.time - time) > 0.01)
  return sortTrajectory([...next, { ...point, time }])
}

export function updateTrajectoryPoint(
  trajectory: TrajectoryPoint[],
  index: number,
  patch: Partial<TrajectoryPoint>,
): TrajectoryPoint[] {
  return trajectory.map((point, i) => (i === index ? { ...point, ...patch } : point))
}

export function removeTrajectoryPoint(
  trajectory: TrajectoryPoint[],
  index: number,
): TrajectoryPoint[] | null {
  if (trajectory.length <= 2) return null
  return trajectory.filter((_, i) => i !== index)
}

export function addSizeKeyframeAtTime(
  hazard: Hazard,
  time: number,
  radius: number,
): TrajectoryPoint[] {
  const clampedTime = clampTrajectoryTime(time, hazard.startTime, hazard.endTime)
  const state = getHazardStateAtTime(hazard, clampedTime)
  if (!state) return hazard.trajectory

  return addTrajectoryPoint(
    hazard.trajectory,
    {
      time: clampedTime,
      x: state.x,
      y: state.y,
      radius: clampHazardRadius(radius),
    },
    hazard.startTime,
    hazard.endTime,
  )
}

export function sampleSizePath(
  hazard: Hazard,
  segments = 48,
): { time: number; radius: number }[] {
  const { startTime, endTime } = hazard
  if (endTime <= startTime) return []

  const points: { time: number; radius: number }[] = []
  for (let i = 0; i <= segments; i++) {
    const t = startTime + (i / segments) * (endTime - startTime)
    const state = getHazardStateAtTime(hazard, t)
    if (state) points.push({ time: t, radius: state.radius })
  }
  return points
}

export function sampleTrajectoryPath(
  hazard: Hazard,
  segments = 64,
): { x: number; y: number }[] {
  const { startTime, endTime } = hazard
  if (endTime <= startTime) return []

  const points: { x: number; y: number }[] = []
  for (let i = 0; i <= segments; i++) {
    const t = startTime + (i / segments) * (endTime - startTime)
    const state = getHazardStateAtTime(hazard, t)
    if (state) points.push({ x: state.x, y: state.y })
  }
  return points
}

export function trajectoryToPolyline(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}
