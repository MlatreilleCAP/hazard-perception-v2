export const MAX_HAZARD_ATTEMPTS = 3
export const MARKER_DURATION_MS = 1100
export const ENGAGEMENT_DELAY_MS = 450
export const CORRECT_CARD_EXTRA_DELAY_MS = 1000
export const CORRECT_HIT_REVEAL_MS = ENGAGEMENT_DELAY_MS + CORRECT_CARD_EXTRA_DELAY_MS
export const HIT_MARKER_DURATION_MS = CORRECT_HIT_REVEAL_MS + 250
export const OUT_OF_ATTEMPTS_CAPTION_MS = 1600

export type AttemptSlotState = 'remaining' | 'miss' | 'hit'

export function attemptSlotStates(
  attempts: number,
  hit: boolean,
  maxAttempts = MAX_HAZARD_ATTEMPTS,
): AttemptSlotState[] {
  const used = Math.min(Math.max(0, attempts), maxAttempts)

  return Array.from({ length: maxAttempts }, (_, index) => {
    if (index >= used) return 'remaining'
    if (hit && index === used - 1) return 'hit'
    return 'miss'
  })
}
