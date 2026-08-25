export function formatTimelineTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

export const FRAME_STEP_SECONDS = 1 / 30

export const MIN_HAZARD_DURATION = 0.25
