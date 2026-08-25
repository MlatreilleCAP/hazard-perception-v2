import { createEmptyActivity } from '@/activities/createEmptyActivity'
import { ActivityEngine } from '@/engine/ActivityEngine'
import { createDefaultNodeRegistry } from '@/nodes'
import { EventSystem } from '@/runtime/EventSystem'
import { DecisionService } from '@/services/decisions'
import { createActivityRepository } from '@/services/persistence'
import { MediaService } from '@/services/media'
import { ScoringService } from '@/services/scoring'
import { initSupabase } from '@/services/supabase'

export function createAppServices() {
  const events = new EventSystem()
  const decisions = new DecisionService()
  const scoring = new ScoringService(decisions)
  const nodes = createDefaultNodeRegistry()
  const supabase = initSupabase()
  const persistence = createActivityRepository(
    supabase ? [] : [createEmptyActivity('Architecture seed activity')],
  )
  const engine = new ActivityEngine({ events, decisions, scoring, nodes })
  const media = new MediaService()

  return {
    events,
    decisions,
    scoring,
    nodes,
    persistence,
    engine,
    media,
    supabase,
  }
}

export const services = createAppServices()
