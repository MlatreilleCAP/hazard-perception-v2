import type { TrajectoryPoint } from '@/types/hazard'

/** Tap zones for one observe hazard. Language-specific copy stays on each version. */
export type ObserveTriggerHazard = {
  id: string
  startTime: number
  endTime: number
  trajectory: TrajectoryPoint[]
  extraTrajectories?: TrajectoryPoint[][]
  radius: number
}

function clonePoint(point: TrajectoryPoint): TrajectoryPoint {
  return typeof point.radius === 'number' ? { ...point } : { time: point.time, x: point.x, y: point.y }
}

function cloneTrajectories(
  items: TrajectoryPoint[][] | undefined,
): TrajectoryPoint[][] | undefined {
  if (!items || items.length === 0) return undefined
  return items.map((trajectory) => trajectory.map(clonePoint))
}

function samePoints(left: TrajectoryPoint[], right: TrajectoryPoint[]): boolean {
  if (left.length !== right.length) return false
  return left.every((point, index) => {
    const other = right[index]
    return (
      point.time === other?.time &&
      point.x === other.x &&
      point.y === other.y &&
      point.radius === other.radius
    )
  })
}

function sameTriggers(left: ObserveTriggerHazard, right: ObserveTriggerHazard): boolean {
  const leftExtras = left.extraTrajectories ?? []
  const rightExtras = right.extraTrajectories ?? []
  return (
    left.startTime === right.startTime &&
    left.endTime === right.endTime &&
    left.radius === right.radius &&
    samePoints(left.trajectory, right.trajectory) &&
    leftExtras.length === rightExtras.length &&
    leftExtras.every((trajectory, index) => samePoints(trajectory, rightExtras[index] ?? []))
  )
}

function triggersFrom(match: ObserveTriggerHazard): ObserveTriggerHazard {
  return {
    id: match.id,
    startTime: match.startTime,
    endTime: match.endTime,
    radius: match.radius,
    trajectory: match.trajectory.map(clonePoint),
    extraTrajectories: cloneTrajectories(match.extraTrajectories),
  }
}

/**
 * Copy trigger zones onto the other language’s hazards.
 * Same ids match first. Hazards imported separately get the zone in the same position.
 * Returns null when every paired hazard already has those zones.
 */
export function applySharedObserveTriggers<T extends ObserveTriggerHazard>(
  target: readonly T[],
  source: readonly ObserveTriggerHazard[],
): T[] | null {
  const sourceIndexById = new Map(source.map((hazard, index) => [hazard.id, index]))
  const consumed = new Set<number>()
  const pairs = target.map((hazard) => {
    const sourceIndex = sourceIndexById.get(hazard.id)
    if (sourceIndex === undefined) return { hazard, sourceIndex: null as number | null }
    consumed.add(sourceIndex)
    return { hazard, sourceIndex }
  })
  const leftovers = source.map((_, index) => index).filter((index) => !consumed.has(index))
  let leftover = 0
  for (const pair of pairs) {
    if (pair.sourceIndex !== null) continue
    const sourceIndex = leftovers[leftover]
    if (sourceIndex === undefined) break
    leftover += 1
    pair.sourceIndex = sourceIndex
  }

  let changed = false
  const next = pairs.map((pair) => {
    if (pair.sourceIndex === null) return pair.hazard
    const match = source[pair.sourceIndex]
    if (!match) return pair.hazard
    const applied = triggersFrom(match)
    if (sameTriggers(pair.hazard, applied)) return pair.hazard
    changed = true
    return {
      ...pair.hazard,
      startTime: applied.startTime,
      endTime: applied.endTime,
      radius: applied.radius,
      trajectory: applied.trajectory,
      extraTrajectories: applied.extraTrajectories,
    }
  })
  return changed ? next : null
}
