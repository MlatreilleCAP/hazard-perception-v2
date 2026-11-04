import { assertEquals } from 'jsr:@std/assert@1'
import { selectClaimIds, type ClaimCandidate } from './claim.ts'

function job(overrides: Partial<ClaimCandidate>): ClaimCandidate {
  return {
    id: 'job-a',
    runAfter: 0,
    status: 'pending',
    claimExpiresAt: null,
    locked: false,
    ...overrides,
  }
}

Deno.test('two workers skip a row the other worker already holds', () => {
  const jobs = [job({ id: 'job-a' }), job({ id: 'job-b', runAfter: 1 })]
  const first = selectClaimIds(jobs, 10, 1)
  const held = jobs.find((item) => item.id === first[0])
  if (held) held.locked = true
  const second = selectClaimIds(jobs, 10, 1)
  assertEquals(first, ['job-a'])
  assertEquals(second, ['job-b'])
})

Deno.test('an expired claim can be recovered and a live claim cannot', () => {
  const jobs = [
    job({ id: 'live', status: 'claimed', claimExpiresAt: 500 }),
    job({ id: 'expired', status: 'claimed', claimExpiresAt: 50, runAfter: 1 }),
    job({ id: 'future', status: 'pending', runAfter: 500 }),
  ]
  assertEquals(selectClaimIds(jobs, 100, 10), ['expired'])
})
