import type { DecisionDefinition } from '@/types/decision'
import type { ActivityEvent } from '@/types/event'
import type { RuntimeState } from '@/types/runtime'
import type { RuntimeScore, ScoringDefinition, ScoringRule } from '@/types/scoring'
import { DecisionService } from '@/services/decisions'

function ruleMatches(
  rule: ScoringRule,
  event: ActivityEvent,
  clockMs: number,
): boolean {
  if (rule.trigger.eventType && rule.trigger.eventType !== event.type) {
    return false
  }
  if (rule.trigger.nodeId && rule.trigger.nodeId !== event.nodeId) {
    return false
  }
  if (rule.trigger.window) {
    const { startMs, endMs } = rule.trigger.window
    if (clockMs < startMs || clockMs > endMs) return false
  }
  return true
}

export class ScoringService {
  private readonly decisions: DecisionService

  constructor(decisions: DecisionService) {
    this.decisions = decisions
  }

  applyEvent(
    event: ActivityEvent,
    scoring: ScoringDefinition,
    decisionDefs: DecisionDefinition[],
    state: RuntimeState,
  ): RuntimeScore {
    let points = state.score.points
    const applied = new Set(state.score.appliedRuleIds)

    for (const rule of scoring.rules) {
      if (applied.has(rule.id)) continue
      if (!ruleMatches(rule, event, state.clockMs)) continue

      if (rule.decisionId) {
        const decision = decisionDefs.find((item) => item.id === rule.decisionId)
        if (!decision || !this.decisions.evaluate(decision.condition, state)) {
          continue
        }
      }

      const next = points + rule.points
      points = rule.maxPoints === null ? next : Math.min(next, rule.maxPoints)
      applied.add(rule.id)
    }

    if (scoring.aggregation === 'sum') {
      points = Math.min(points, scoring.maxScore)
    }

    const passed =
      scoring.passingScore === null ? null : points >= scoring.passingScore

    return {
      points,
      maxPoints: scoring.maxScore,
      passed,
      appliedRuleIds: [...applied],
    }
  }
}
