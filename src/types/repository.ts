import type {
  ActivityDefinition,
  ActivityId,
  ActivitySummary,
} from './activity'

export type PersistenceDriver = 'memory' | 'supabase'

/** authoring: current user's activities; catalog: all published activities. */
export type ActivityListScope = 'authoring' | 'catalog'

export interface ActivityRepository {
  readonly driver: PersistenceDriver
  list(scope?: ActivityListScope): Promise<ActivitySummary[]>
  getById(id: ActivityId): Promise<ActivityDefinition | null>
  getPublished(id: ActivityId): Promise<ActivityDefinition | null>
  save(definition: ActivityDefinition): Promise<ActivityDefinition>
  publish(id: ActivityId): Promise<ActivityDefinition>
  delete(id: ActivityId): Promise<void>
}
