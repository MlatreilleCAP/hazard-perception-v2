export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'exists'
  | 'and'
  | 'or'
  | 'not'

/**
 * Declarative condition. Evaluated by the decision service, not by node views.
 */
export interface Condition {
  id: string
  operator: ConditionOperator
  path: string | null
  value: unknown
  children: Condition[]
}

export interface DecisionDefinition {
  id: string
  name: string
  condition: Condition
}
