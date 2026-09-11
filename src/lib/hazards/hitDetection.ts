import { DEFAULT_HAZARD_RADIUS } from '@/lib/hazards/constants'
import { getHazardStatesAtTime, type HazardState } from '@/lib/hazards/interpolate'
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

function isClickOnState(
  click: ClickPoint,
  state: HazardState,
  frame?: VideoFrameSize,
): boolean {
  const dx = click.x - state.x
  const dy = click.y - state.y
  const radius = Math.max(state.radius, DEFAULT_HAZARD_RADIUS)

  // Overlay circles are sized from video width. Convert percent offsets into
  // pixels so a tap on the visible circle hits on non-square frames.
  if (frame && frame.width > 0 && frame.height > 0) {
    const dxPx = (dx / 100) * frame.width
    const dyPx = (dy / 100) * frame.height
    const radiusPx = (radius / 100) * frame.width
    return Math.sqrt(dxPx * dxPx + dyPx * dyPx) <= radiusPx
  }

  return Math.sqrt(dx * dx + dy * dy) <= radius
}

export function isClickOnHazard(
  click: ClickPoint,
  hazard: Hazard,
  currentTime: number,
  frame?: VideoFrameSize,
): boolean {
  return getHazardStatesAtTime(hazard, currentTime).some((state) =>
    isClickOnState(click, state, frame),
  )
}

export function hazardHitByClick<T extends Hazard>(
  hazards: T[],
  resolvedIds: Set<string>,
  click: ClickPoint,
  currentTime: number,
  frame?: VideoFrameSize,
): T | null {
  return (
    hazards.find(
      (hazard) =>
        !resolvedIds.has(hazard.id) &&
        currentTime <= hazard.endTime + 0.05 &&
        isClickOnHazard(click, hazard, currentTime, frame),
    ) ?? null
  )
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

/**
 * Hazard a click should count toward.
 * Prefers the hazard currently on screen; otherwise the next unresolved hazard
 * that has not ended yet so taps before/outside its window still count as misses.
 */
export function targetHazardForClick<T extends Hazard>(
  hazards: T[],
  resolvedIds: Set<string>,
  time: number,
): T | null {
  const active = activeHazardAtTime(hazards, resolvedIds, time)
  if (active) return active

  return (
    hazards.find((hazard) => !resolvedIds.has(hazard.id) && time <= hazard.endTime) ?? null
  )
}
