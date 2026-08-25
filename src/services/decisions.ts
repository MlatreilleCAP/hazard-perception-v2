import type { Condition } from '@/types/decision'
import type { RuntimeState } from '@/types/runtime'

function readPath(variables: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = variables
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function compare(left: unknown, right: unknown, operator: Condition['operator']): boolean {
  if (operator === 'equals') return Object.is(left, right)
  if (operator === 'notEquals') return !Object.is(left, right)
  if (
    operator === 'gt' ||
    operator === 'gte' ||
    operator === 'lt' ||
    operator === 'lte'
  ) {
    if (typeof left !== 'number' || typeof right !== 'number') return false
    if (operator === 'gt') return left > right
    if (operator === 'gte') return left >= right
    if (operator === 'lt') return left < right
    return left <= right
  }
  if (operator === 'contains') {
    if (typeof left === 'string' && typeof right === 'string') {
      return left.includes(right)
    }
    if (Array.isArray(left)) return left.includes(right)
    return false
  }
  if (operator === 'exists') return left !== undefined && left !== null
  return false
}

export class DecisionService {
  evaluate(condition: Condition, state: RuntimeState): boolean {
    if (condition.operator === 'and') {
      return condition.children.every((child) => this.evaluate(child, state))
    }
    if (condition.operator === 'or') {
      return condition.children.some((child) => this.evaluate(child, state))
    }
    if (condition.operator === 'not') {
      const [child] = condition.children
      return child ? !this.evaluate(child, state) : false
    }

    const left = condition.path ? readPath(state.variables, condition.path) : undefined
    return compare(left, condition.value, condition.operator)
  }
}
