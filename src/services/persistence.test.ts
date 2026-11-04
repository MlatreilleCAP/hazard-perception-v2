import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSeeActivity } from '@/activities/createSeeActivity'
import { SupabaseActivityRepository } from '@/services/persistence'

function fakeClient() {
  const lookups: string[] = []
  const query = {
    select() {
      return query
    },
    eq(_column: string, value: string) {
      lookups.push(value)
      return query
    },
    is() {
      return query
    },
    order() {
      return query
    },
    maybeSingle: async () => ({ data: null, error: null }),
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    from() {
      return query
    },
  }
  return { client: client as unknown as SupabaseClient, lookups }
}

describe('activity lookups', () => {
  it('does not query Postgres with a blank activity id', async () => {
    const { client, lookups } = fakeClient()
    const repository = new SupabaseActivityRepository(client)
    const activity = createSeeActivity('Observe')
    activity.id = ''

    await expect(repository.getById('')).resolves.toBeNull()
    await expect(repository.save(activity)).rejects.toThrow(/id is missing/)
    expect(lookups).toEqual([])
  })
})
