import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSeeActivity } from '@/activities/createSeeActivity'
import { toDefinitionDocument } from '@/services/activityMapper'
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

describe('publish', () => {
  it('clears removal so a removed activity is visible after publish', async () => {
    const activityId = '70b114cc-7fc0-406f-8903-962966ef0ced'
    const definition = createSeeActivity('Italy Observe Example')
    definition.id = activityId
    definition.version = 5
    const updates: Array<Record<string, unknown>> = []
    const query = {
      update(values: Record<string, unknown>) {
        updates.push(values)
        return query
      },
      eq() {
        return query
      },
      not() {
        return Promise.resolve({ error: null })
      },
    }
    const client = {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: '11aa1df9-cbba-4f4c-9936-63eb1a5e9feb' } } },
          error: null,
        }),
      },
      from() {
        return query
      },
      rpc: async (name: string) => {
        if (name === 'get_published_activity') {
          return {
            error: null,
            data: {
              activity: {
                id: activityId,
                title: 'Italy Observe Example',
                description: '',
                locale: 'en',
                tags: ['introduction'],
                created_by: '11aa1df9-cbba-4f4c-9936-63eb1a5e9feb',
                published_version_id: 'dbb49c49-993b-4bf4-b178-186f09c4633f',
                removed_at: null,
                created_at: '2026-11-09T15:17:21.794Z',
                updated_at: '2026-11-09T20:31:08.832Z',
              },
              version: {
                id: 'dbb49c49-993b-4bf4-b178-186f09c4633f',
                activity_id: activityId,
                version: 5,
                schema_version: 1,
                status: 'published',
                definition: toDefinitionDocument(definition),
                created_by: '11aa1df9-cbba-4f4c-9936-63eb1a5e9feb',
                created_at: '2026-11-09T20:31:08.832Z',
                updated_at: '2026-11-09T20:31:08.832Z',
                published_at: '2026-11-09T20:31:08.832Z',
              },
            },
          }
        }
        return { error: null, data: 'dbb49c49-993b-4bf4-b178-186f09c4633f' }
      },
    }
    const repository = new SupabaseActivityRepository(client as unknown as SupabaseClient)

    const published = await repository.publish(activityId)

    expect(updates).toEqual([{ removed_at: null }])
    expect(published.id).toBe(activityId)
    expect(published.version).toBe(5)
  })
})
