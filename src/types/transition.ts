/**
 * Logical edge in the flow graph. Timeline clips must remain consistent
 * with the nodes these transitions connect.
 */
export interface ActivityTransition {
  id: string
  fromNodeId: string
  toNodeId: string
  label: string
  triggerEventType: string | null
  decisionId: string | null
}
