export interface FlowPosition {
  x: number
  y: number
}

/**
 * Temporal binding for a node. Kept in sync with TimelineConfiguration clips
 * that reference the same nodeId.
 */
export interface NodeTimelineBinding {
  trackId: string
  startMs: number
  endMs: number
}

export type NodeCategory = 'system' | 'content' | 'media' | 'input' | 'decision'

export interface ActivityNode<TConfig = Record<string, unknown>> {
  id: string
  type: string
  name: string
  category: NodeCategory
  flow: FlowPosition
  timeline: NodeTimelineBinding | null
  /** Use MediaRef.media_asset_id for media; never a public URL. */
  config: TConfig
}
