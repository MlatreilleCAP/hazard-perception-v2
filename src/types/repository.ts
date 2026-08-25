import type {
  ActivityDefinition,
  ActivityId,
  ActivitySummary,
} from './activity'

export type PersistenceDriver = 'memory' | 'supabase'

export interface ActivityRepository {
  readonly driver: PersistenceDriver
  list(): Promise<ActivitySummary[]>
  getById(id: ActivityId): Promise<ActivityDefinition | null>
  getPublished(id: ActivityId): Promise<ActivityDefinition | null>
  save(definition: ActivityDefinition): Promise<ActivityDefinition>
  publish(id: ActivityId): Promise<ActivityDefinition>
  delete(id: ActivityId): Promise<void>
}
