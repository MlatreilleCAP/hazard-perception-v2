import type { ActivityDefinition } from '@/types/activity'
import { assertNoPublicMediaUrls } from '@/types/media'

export function validateActivityDefinition(
  definition: ActivityDefinition,
): string[] {
  const errors: string[] = []
  const nodeIds = new Set(definition.nodes.map((node) => node.id))
  const decisionIds = new Set(definition.decisions.map((d) => d.id))
  const trackIds = new Set(definition.timeline.tracks.map((t) => t.id))

  if (!nodeIds.has(definition.entryNodeId)) {
    errors.push(`entryNodeId "${definition.entryNodeId}" does not exist`)
  }

  for (const transition of definition.transitions) {
    if (!nodeIds.has(transition.fromNodeId)) {
      errors.push(
        `Transition ${transition.id} fromNodeId "${transition.fromNodeId}" is missing`,
      )
    }
    if (!nodeIds.has(transition.toNodeId)) {
      errors.push(
        `Transition ${transition.id} toNodeId "${transition.toNodeId}" is missing`,
      )
    }
    if (transition.decisionId && !decisionIds.has(transition.decisionId)) {
      errors.push(
        `Transition ${transition.id} decisionId "${transition.decisionId}" is missing`,
      )
    }
  }

  for (const clip of definition.timeline.clips) {
    if (!nodeIds.has(clip.nodeId)) {
      errors.push(`Timeline clip ${clip.id} references missing node ${clip.nodeId}`)
    }
    if (!trackIds.has(clip.trackId)) {
      errors.push(`Timeline clip ${clip.id} references missing track ${clip.trackId}`)
    }
  }

  for (const node of definition.nodes) {
    if (!node.timeline) continue
    const clip = definition.timeline.clips.find((c) => c.nodeId === node.id)
    if (!clip) {
      errors.push(
        `Node ${node.id} has a timeline binding but no matching timeline clip`,
      )
      continue
    }
    if (clip.trackId !== node.timeline.trackId) {
      errors.push(`Node ${node.id} timeline track is out of sync with its clip`)
    }
    if (clip.startMs !== node.timeline.startMs) {
      errors.push(`Node ${node.id} timeline start is out of sync with its clip`)
    }
    if (clip.startMs + clip.durationMs !== node.timeline.endMs) {
      errors.push(`Node ${node.id} timeline end is out of sync with its clip`)
    }
  }

  for (const error of assertNoPublicMediaUrls(definition)) {
    errors.push(error)
  }

  return errors
}
