import { describe, expect, it } from 'vitest'
import {
  formatReleaseDate,
  groupByReleaseBucket,
  readReleaseBuckets,
} from '@/lib/lesson/releaseBuckets'

describe('readReleaseBuckets', () => {
  it('keeps named releases with a real date and sorts them by that date', () => {
    expect(
      readReleaseBuckets({
        buckets: [
          { id: 'b', name: '  Summer  ', releaseDate: '2026-07-01' },
          { id: 'a', name: 'Spring', releaseDate: '2026-03-15' },
          { id: 'c', name: 'Skip', releaseDate: '2026-02-31' },
          { id: '', name: 'Missing id', releaseDate: '2026-01-01' },
        ],
      }),
    ).toEqual([
      { id: 'a', name: 'Spring', releaseDate: '2026-03-15' },
      { id: 'b', name: 'Summer', releaseDate: '2026-07-01' },
    ])
  })
})

describe('groupByReleaseBucket', () => {
  const spring = { id: 'spring', name: 'Spring', releaseDate: '2026-03-15' }
  const summer = { id: 'summer', name: 'Summer', releaseDate: '2026-07-01' }

  it('puts cards without a release first and keeps empty releases', () => {
    const sections = groupByReleaseBucket(
      [
        { id: '1', releaseBucketId: 'summer' },
        { id: '2', releaseBucketId: '' },
        { id: '3', releaseBucketId: 'missing' },
        { id: '4', releaseBucketId: 'spring' },
      ],
      [summer, spring],
    )
    expect(sections.map((section) => section.bucket?.id ?? 'unscheduled')).toEqual([
      'unscheduled',
      'spring',
      'summer',
    ])
    expect(sections[0]?.cards.map((card) => card.id)).toEqual(['2', '3'])
    expect(sections[1]?.cards.map((card) => card.id)).toEqual(['4'])
    expect(sections[2]?.cards.map((card) => card.id)).toEqual(['1'])
  })

  it('keeps an empty unscheduled section when releases exist', () => {
    const sections = groupByReleaseBucket([{ id: '1', releaseBucketId: 'spring' }], [spring])
    expect(sections.map((section) => section.bucket?.name ?? 'Unscheduled')).toEqual([
      'Unscheduled',
      'Spring',
    ])
    expect(sections[0]?.cards).toEqual([])
  })
})

describe('formatReleaseDate', () => {
  it('formats a calendar date without shifting the day', () => {
    expect(formatReleaseDate('2026-03-15')).toBe('Mar 15, 2026')
  })
})
