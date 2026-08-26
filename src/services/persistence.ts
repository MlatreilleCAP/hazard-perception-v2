import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityDefinition, ActivityId, ActivitySummary } from '@/types/activity'
import type { ActivityRow, ActivityVersionRow } from '@/types/database'
import type { ActivityRepository, PersistenceDriver } from '@/types/repository'
import { validateActivityDefinition } from '@/engine/validateActivity'
import {
  fromVersionRows,
  toDefinitionDocument,
} from '@/services/activityMapper'
import { getSupabase } from '@/services/supabase'

export class InMemoryActivityRepository implements ActivityRepository {
  readonly driver: PersistenceDriver = 'memory'
  private readonly activities = new Map<ActivityId, ActivityDefinition>()

  constructor(seed: ActivityDefinition[] = []) {
    for (const activity of seed) {
      this.activities.set(activity.id, structuredClone(activity))
    }
  }

  async list(): Promise<ActivitySummary[]> {
    return [...this.activities.values()].map((activity) => ({
      id: activity.id,
      title: activity.metadata.title,
      version: activity.version,
      updatedAt: activity.metadata.updatedAt,
      published: activity.version >= 1,
      tags: [...activity.metadata.tags],
    }))
  }

  async getById(id: ActivityId): Promise<ActivityDefinition | null> {
    const activity = this.activities.get(id)
    return activity ? structuredClone(activity) : null
  }

  async getPublished(id: ActivityId): Promise<ActivityDefinition | null> {
    const activity = await this.getById(id)
    if (!activity || activity.version < 1) return null
    return activity
  }

  async save(definition: ActivityDefinition): Promise<ActivityDefinition> {
    const errors = validateActivityDefinition(definition)
    if (errors.length > 0) {
      throw new Error(`Invalid activity definition:\n${errors.join('\n')}`)
    }
    const stored = structuredClone(definition)
    this.activities.set(stored.id, stored)
    return structuredClone(stored)
  }

  async publish(id: ActivityId): Promise<ActivityDefinition> {
    const current = this.activities.get(id)
    if (!current) {
      throw new Error(`Activity ${id} not found`)
    }
    const published = structuredClone(current)
    published.version = current.version < 1 ? 1 : current.version + 1
    this.activities.set(id, published)
    return structuredClone(published)
  }

  async delete(id: ActivityId): Promise<void> {
    this.activities.delete(id)
  }
}

export class SupabaseActivityRepository implements ActivityRepository {
  readonly driver: PersistenceDriver = 'supabase'
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async list(): Promise<ActivitySummary[]> {
    await this.requireUserId()
    const { data, error } = await this.client
      .from('activities')
      .select('id, title, updated_at, published_version_id, tags')
      .is('removed_at', null)
      .order('updated_at', { ascending: false })

    throwIfError(error, 'Failed to list activities')

    const rows = (data ?? []) as Pick<
      ActivityRow,
      'id' | 'title' | 'updated_at' | 'published_version_id' | 'tags'
    >[]
    const publishedIds = rows
      .map((row) => row.published_version_id)
      .filter((id): id is string => Boolean(id))

    const versionsById = new Map<string, number>()
    if (publishedIds.length > 0) {
      const { data: versions, error: versionError } = await this.client
        .from('activity_versions')
        .select('id, version')
        .in('id', publishedIds)
      throwIfError(versionError, 'Failed to list activity versions')
      for (const version of (versions ?? []) as Pick<ActivityVersionRow, 'id' | 'version'>[]) {
        if (version.version !== null) {
          versionsById.set(version.id, version.version)
        }
      }
    }

    return rows.map((row) => {
      const version = row.published_version_id
        ? (versionsById.get(row.published_version_id) ?? 0)
        : 0
      return {
        id: row.id,
        title: row.title,
        version,
        updatedAt: row.updated_at,
        published: Boolean(row.published_version_id) && version >= 1,
        tags: row.tags ?? [],
      }
    })
  }

  async getById(id: ActivityId): Promise<ActivityDefinition | null> {
    return this.getVersion(id, 'draft')
  }

  async getPublished(id: ActivityId): Promise<ActivityDefinition | null> {
    return this.getVersion(id, 'published')
  }

  async save(definition: ActivityDefinition): Promise<ActivityDefinition> {
    await this.requireUserId()
    const errors = validateActivityDefinition(definition)
    if (errors.length > 0) {
      throw new Error(`Invalid activity definition:\n${errors.join('\n')}`)
    }

    const existing = await this.getActivityRow(definition.id)
    if (!existing) {
      return this.createActivity(definition)
    }

    const { error: activityError } = await this.client
      .from('activities')
      .update({
        title: definition.metadata.title,
        description: definition.metadata.description,
        locale: definition.metadata.locale,
        tags: definition.metadata.tags,
      })
      .eq('id', definition.id)
    throwIfError(activityError, 'Failed to update activity')

    const { data: draft, error: draftError } = await this.client
      .from('activity_versions')
      .update({
        definition: toDefinitionDocument(definition),
        schema_version: definition.schemaVersion,
      })
      .eq('activity_id', definition.id)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle()
    throwIfError(draftError, 'Failed to update draft version')
    if (!draft) {
      throw new Error(`No draft version to save for activity ${definition.id}`)
    }

    const saved = await this.getById(definition.id)
    if (!saved) {
      throw new Error(`Activity ${definition.id} was not found after save`)
    }
    return saved
  }

  async publish(id: ActivityId): Promise<ActivityDefinition> {
    await this.requireUserId()
    const { error } = await this.client.rpc('publish_activity', {
      p_activity_id: id,
    })
    throwIfError(error, 'Failed to publish activity')

    const published = await this.getPublished(id)
    if (!published) {
      throw new Error(`Activity ${id} has no published version after publish`)
    }
    return published
  }

  async delete(id: ActivityId): Promise<void> {
    await this.requireUserId()
    const { error } = await this.client.rpc('remove_activity', {
      p_activity_id: id,
    })
    throwIfError(error, 'Failed to remove activity')
  }

  private async createActivity(
    definition: ActivityDefinition,
  ): Promise<ActivityDefinition> {
    const { data, error } = await this.client.rpc('create_activity', {
      p_title: definition.metadata.title,
      p_description: definition.metadata.description,
      p_locale: definition.metadata.locale,
      p_definition: toDefinitionDocument(definition),
    })
    throwIfError(error, 'Failed to create activity')

    const activityId = typeof data === 'string' ? data : null
    if (!activityId) {
      throw new Error('create_activity did not return an activity id')
    }

    const { error: tagError } = await this.client
      .from('activities')
      .update({ tags: definition.metadata.tags })
      .eq('id', activityId)
    throwIfError(tagError, 'Failed to set activity tags')

    const saved = await this.getById(activityId)
    if (!saved) {
      throw new Error(`Activity ${activityId} was not found after create`)
    }
    return saved
  }

  private async getVersion(
    id: ActivityId,
    status: 'draft' | 'published',
  ): Promise<ActivityDefinition | null> {
    await this.requireUserId()
    const activity = await this.getActivityRow(id)
    if (!activity || activity.removed_at) return null

    if (status === 'published') {
      if (!activity.published_version_id) return null
      const { data, error } = await this.client
        .from('activity_versions')
        .select('*')
        .eq('id', activity.published_version_id)
        .eq('status', 'published')
        .maybeSingle()
      throwIfError(error, 'Failed to load published activity version')
      if (!data) return null
      return fromVersionRows(activity, data as ActivityVersionRow)
    }

    const { data, error } = await this.client
      .from('activity_versions')
      .select('*')
      .eq('activity_id', id)
      .eq('status', 'draft')
      .maybeSingle()
    throwIfError(error, 'Failed to load draft activity version')
    if (!data) return null
    return fromVersionRows(activity, data as ActivityVersionRow)
  }

  private async getActivityRow(id: ActivityId): Promise<ActivityRow | null> {
    const { data, error } = await this.client
      .from('activities')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    throwIfError(error, 'Failed to load activity')
    return (data as ActivityRow | null) ?? null
  }

  private async requireUserId(): Promise<string> {
    const { data, error } = await this.client.auth.getSession()
    if (error) {
      throw new Error(`Failed to read auth session: ${error.message}`)
    }
    const userId = data.session?.user.id
    if (!userId) {
      throw new Error('Sign in required to use activity persistence')
    }
    return userId
  }
}

export function createActivityRepository(
  seed: ActivityDefinition[] = [],
): ActivityRepository {
  const client = getSupabase()
  if (client) {
    return new SupabaseActivityRepository(client)
  }
  return new InMemoryActivityRepository(seed)
}

function throwIfError(error: { message: string } | null, action: string): void {
  if (error) {
    throw new Error(`${action}: ${error.message}`)
  }
}
