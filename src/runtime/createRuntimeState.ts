import { cloneJson } from '@/app/clone'
import type { ActivityDefinition } from '@/types/activity'
import type { RuntimeScore } from '@/types/scoring'
import type { RuntimeAdapterKind, RuntimeState } from '@/types/runtime'
import { createId } from '@/app/id'

export function createIdleRuntimeState(
  definition: ActivityDefinition,
  adapter: RuntimeAdapterKind = 'web',
): RuntimeState {
  const variables: Record<string, unknown> = {}
  for (const variable of definition.variables) {
    variables[variable.name] = cloneJson(variable.defaultValue)
  }

  const score: RuntimeScore = {
    points: 0,
    maxPoints: definition.scoring.maxScore,
    passed: null,
    appliedRuleIds: [],
  }

  return {
    sessionId: createId(),
    activityId: definition.id,
    activityVersion: definition.version,
    adapter,
    status: 'idle',
    currentNodeId: null,
    clockMs: 0,
    variables,
    eventLog: [],
    score,
  }
}
