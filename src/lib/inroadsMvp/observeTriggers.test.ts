import { describe, expect, it } from 'vitest'
import { applySharedObserveTriggers, type ObserveTriggerHazard } from '@/lib/inroadsMvp/observeTriggers'

type Hazard = ObserveTriggerHazard & { explanation: string }

function hazard(id: string, x: number, extras = 0): Hazard {
  const extraTrajectories =
    extras > 0
      ? Array.from({ length: extras }, (_, index) => [
          { time: 1, x: x + index + 1, y: 40 },
          { time: 2, x: x + index + 1, y: 40 },
        ])
      : undefined
  return {
    id,
    startTime: 1,
    endTime: 2,
    radius: 8,
    trajectory: [
      { time: 1, x, y: 50 },
      { time: 2, x, y: 50 },
    ],
    extraTrajectories,
    explanation: `${id} copy`,
  }
}

describe('applySharedObserveTriggers', () => {
  it('copies zones onto the same hazard and keeps that language’s copy', () => {
    const target = [hazard('parked-car', 10)]
    const source = [hazard('parked-car', 70, 1)]

    const next = applySharedObserveTriggers(target, source)

    expect(next?.[0]?.trajectory[0]?.x).toBe(70)
    expect(next?.[0]?.extraTrajectories).toHaveLength(1)
    expect(next?.[0]?.explanation).toBe('parked-car copy')
  })

  it('copies zones by position when the language version has its own hazard id', () => {
    const target = [hazard('italian-hazard', 10)]
    const source = [hazard('english-hazard', 80, 1)]

    const next = applySharedObserveTriggers(target, source)

    expect(next?.[0]?.id).toBe('italian-hazard')
    expect(next?.[0]?.trajectory[0]?.x).toBe(80)
    expect(next?.[0]?.extraTrajectories).toHaveLength(1)
    expect(next?.[0]?.explanation).toBe('italian-hazard copy')
  })

  it('keeps an id match ahead of position', () => {
    const target = [hazard('second', 1), hazard('first', 2)]
    const source = [hazard('first', 10), hazard('second', 20)]

    const next = applySharedObserveTriggers(target, source)

    expect(next?.map((item) => [item.id, item.trajectory[0]?.x])).toEqual([
      ['second', 20],
      ['first', 10],
    ])
  })

  it('clears a trigger that was removed on the edited version', () => {
    const target = [hazard('parked-car', 10, 2)]
    const source = [hazard('parked-car', 10)]

    const next = applySharedObserveTriggers(target, source)

    expect(next?.[0]?.extraTrajectories).toBeUndefined()
    expect(next?.[0]?.explanation).toBe('parked-car copy')
  })

  it('does nothing when the zones already match', () => {
    const target = [hazard('parked-car', 10, 1)]
    expect(applySharedObserveTriggers(target, [hazard('parked-car', 10, 1)])).toBeNull()
  })
})
