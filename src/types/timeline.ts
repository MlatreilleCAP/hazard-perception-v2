export type TimelineTrackKind = 'media' | 'nodes' | 'markers'

export interface TimelineTrack {
  id: string
  name: string
  kind: TimelineTrackKind
}

/**
 * Temporal instance of a flow node. clip.nodeId must exist on the activity.
 */
export interface TimelineClip {
  id: string
  trackId: string
  nodeId: string
  startMs: number
  durationMs: number
}

export interface TimelineMarker {
  id: string
  timeMs: number
  label: string
  eventType: string | null
}

export interface TimelineConfiguration {
  durationMs: number
  tracks: TimelineTrack[]
  clips: TimelineClip[]
  markers: TimelineMarker[]
}
