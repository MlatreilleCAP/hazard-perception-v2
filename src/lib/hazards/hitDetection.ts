import { getHazardStateAtTime } from '@/lib/hazards/interpolate'
import type { Hazard } from '@/types/hazard'

export type ClickPoint = {
  x: number
  y: number
  time: number
}

export type VideoFrameSize = {
  width: number
  height: number
}

export function isClickOnHazard(
  click: ClickPoint,
  hazard: Hazard,
  currentTime: number,
  frame?: VideoFrameSize,
): boolean {
  const state = getHazardStateAtTime(hazard, currentTime)
  if (!state) return false

  const dx = click.x - state.x
  const dy = click.y - state.y

  // Overlay circles are sized from video width. Convert percent offsets into
  // pixels so a tap on the visible circle hits on non-square frames.
  if (frame && frame.width > 0 && frame.height > 0) {
    const dxPx = (dx / 100) * frame.width
    const dyPx = (dy / 100) * frame.height
    const radiusPx = (state.radius / 100) * frame.width
    return Math.sqrt(dxPx * dxPx + dyPx * dyPx) <= radiusPx
  }

  return Math.sqrt(dx * dx + dy * dy) <= state.radius
}

export function closedHazardIds(
  resolvedIds: Set<string>,
  deferredMissIds: Set<string>,
): Set<string> {
  const ids = new Set(resolvedIds)
  for (const id of deferredMissIds) ids.add(id)
  return ids
}

export function activeHazardAtTime<T extends Hazard>(
  hazards: T[],
  resolvedIds: Set<string>,
  time: number,
): T | null {
  return (
    hazards.find(
      (hazard) =>
        !resolvedIds.has(hazard.id) &&
        time >= hazard.startTime &&
        time <= hazard.endTime,
    ) ?? null
  )
}

/** Hazard a click should count toward — only while that hazard is on screen. */
export function targetHazardForClick<T extends Hazard>(
  hazards: T[],
  resolvedIds: Set<string>,
  time: number,
): T | null {
  return activeHazardAtTime(hazards, resolvedIds, time)
}
