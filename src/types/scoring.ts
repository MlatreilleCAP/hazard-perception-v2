/**
 * Scoring is data on the Activity Definition and applied by the scoring
 * service. Visual node components must not compute scores.
 */
export interface ScoringWindow {
  startMs: number
  endMs: number
}

export interface ScoringTrigger {
  eventType: string | null
  nodeId: string | null
  window: ScoringWindow | null
}

export interface ScoringRule {
  id: string
  name: string
  trigger: ScoringTrigger
  points: number
  maxPoints: number | null
  decisionId: string | null
}

export type ScoreAggregation = 'sum' | 'weighted'

export interface ScoringDefinition {
  maxScore: number
  passingScore: number | null
  aggregation: ScoreAggregation
  rules: ScoringRule[]
}

export interface RuntimeScore {
  points: number
  maxPoints: number
  passed: boolean | null
  appliedRuleIds: string[]
}
