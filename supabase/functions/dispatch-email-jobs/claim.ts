export interface ClaimCandidate {
  id: string
  runAfter: number
  status: 'pending' | 'claimed' | 'sent' | 'skipped' | 'failed'
  claimExpiresAt: number | null
  locked: boolean
}

/** Mirrors claim_email_jobs: due pending rows and expired claims, skipping locked rows. */
export function selectClaimIds(jobs: ClaimCandidate[], now: number, limit: number): string[] {
  return jobs
    .filter((job) => {
      if (job.locked) return false
      if (job.status === 'pending' && job.runAfter <= now) return true
      return job.status === 'claimed' && job.claimExpiresAt !== null && job.claimExpiresAt <= now
    })
    .sort((left, right) => left.runAfter - right.runAfter || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map((job) => job.id)
}
