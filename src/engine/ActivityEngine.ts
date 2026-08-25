import type { ActivityDefinition } from '@/types/activity'
import type { ActivityEvent, NewActivityEvent } from '@/types/event'
import type { RuntimeAdapter, RuntimeState } from '@/types/runtime'
import type { EngineContext } from '@/engine/context'
import { validateActivityDefinition } from '@/engine/validateActivity'
import type { NodeRegistry } from '@/nodes/types'
import { EventSystem } from '@/runtime/EventSystem'
import { createIdleRuntimeState } from '@/runtime/createRuntimeState'
import { WebRuntimeAdapter } from '@/runtime/adapters/webAdapter'
import { DecisionService } from '@/services/decisions'
import { ScoringService } from '@/services/scoring'

export interface ActivityEngineDeps {
  events: EventSystem
  decisions: DecisionService
  scoring: ScoringService
  nodes: NodeRegistry
  adapter?: RuntimeAdapter
}

export class ActivityEngine {
  private definition: ActivityDefinition | null = null
  private state: RuntimeState | null = null
  private readonly events: EventSystem
  private readonly decisions: DecisionService
  private readonly scoring: ScoringService
  private readonly nodes: NodeRegistry
  private readonly adapter: RuntimeAdapter

  constructor(deps: ActivityEngineDeps) {
    this.events = deps.events
    this.decisions = deps.decisions
    this.scoring = deps.scoring
    this.nodes = deps.nodes
    this.adapter = deps.adapter ?? new WebRuntimeAdapter()
  }

  load(definition: ActivityDefinition): void {
    const errors = validateActivityDefinition(definition)
    if (errors.length > 0) {
      throw new Error(`Invalid activity definition:\n${errors.join('\n')}`)
    }
    this.definition = structuredClone(definition)
    this.state = createIdleRuntimeState(this.definition, this.adapter.kind)
  }

  start(): RuntimeState {
    const definition = this.requireDefinition()
    this.state = createIdleRuntimeState(definition, this.adapter.kind)
    this.state.status = 'running'
    this.record({
      type: 'activity.started',
      source: 'engine',
      nodeId: definition.entryNodeId,
      payload: {},
    })
    this.enterNode(definition.entryNodeId)
    return this.getState()
  }

  pause(): RuntimeState {
    this.requireRunning()
    this.requireState().status = 'paused'
    this.record({
      type: 'activity.paused',
      source: 'engine',
      nodeId: this.requireState().currentNodeId,
      payload: {},
    })
    return this.getState()
  }

  resume(): RuntimeState {
    const state = this.requireState()
    if (state.status !== 'paused') {
      throw new Error('Activity is not paused')
    }
    state.status = 'running'
    this.record({
      type: 'activity.resumed',
      source: 'engine',
      nodeId: state.currentNodeId,
      payload: {},
    })
    return this.getState()
  }

  stop(): RuntimeState {
    const state = this.requireState()
    state.status = 'stopped'
    this.record({
      type: 'activity.stopped',
      source: 'engine',
      nodeId: state.currentNodeId,
      payload: {},
    })
    return this.getState()
  }

  tick(deltaMs: number): RuntimeState {
    const state = this.requireState()
    if (state.status !== 'running') return this.getState()
    state.clockMs += deltaMs
    this.fireTimelineMarkers()
    this.adapter.syncState(state)
    return this.getState()
  }

  dispatch(input: NewActivityEvent): RuntimeState {
    const event = this.record(input)
    this.tryEventTransition(event)
    this.adapter.syncState(this.requireState())
    return this.getState()
  }

  getState(): RuntimeState {
    return structuredClone(this.requireState())
  }

  getDefinition(): Readonly<ActivityDefinition> {
    return this.requireDefinition()
  }

  private enterNode(nodeId: string): void {
    const definition = this.requireDefinition()
    const node = definition.nodes.find((item) => item.id === nodeId)
    if (!node) {
      throw new Error(`Cannot enter missing node ${nodeId}`)
    }
    this.requireState().currentNodeId = nodeId
    this.nodes.get(node.type)?.onEnter?.(this.createContext())
    this.record({
      type: 'node.entered',
      source: 'engine',
      nodeId,
      payload: { nodeType: node.type },
    })
    if (node.type === 'system.end') {
      this.requireState().status = 'completed'
      this.record({
        type: 'activity.completed',
        source: 'engine',
        nodeId,
        payload: {},
      })
      return
    }
    this.tryAutomaticTransition()
  }

  private exitNode(nodeId: string): void {
    const definition = this.requireDefinition()
    const node = definition.nodes.find((item) => item.id === nodeId)
    if (!node) return
    this.nodes.get(node.type)?.onExit?.(this.createContext())
    this.record({
      type: 'node.exited',
      source: 'engine',
      nodeId,
      payload: { nodeType: node.type },
    })
  }

  private tryAutomaticTransition(): void {
    this.takeFirstMatchingTransition((transition) => transition.triggerEventType === null)
  }

  private tryEventTransition(event: ActivityEvent): void {
    this.takeFirstMatchingTransition(
      (transition) =>
        transition.triggerEventType !== null &&
        transition.triggerEventType === event.type,
    )
  }

  private takeFirstMatchingTransition(
    matches: (transition: ActivityDefinition['transitions'][number]) => boolean,
  ): void {
    const definition = this.requireDefinition()
    const state = this.requireState()
    if (state.status !== 'running' || !state.currentNodeId) return

    const outgoing = definition.transitions.filter(
      (transition) =>
        transition.fromNodeId === state.currentNodeId && matches(transition),
    )

    for (const transition of outgoing) {
      if (transition.decisionId) {
        const decision = definition.decisions.find(
          (item) => item.id === transition.decisionId,
        )
        if (!decision || !this.decisions.evaluate(decision.condition, state)) {
          continue
        }
      }

      const fromNodeId = state.currentNodeId
      this.exitNode(fromNodeId)
      this.record({
        type: 'transition.taken',
        source: 'engine',
        nodeId: fromNodeId,
        payload: { transitionId: transition.id, toNodeId: transition.toNodeId },
      })
      this.enterNode(transition.toNodeId)
      return
    }
  }

  private fireTimelineMarkers(): void {
    const definition = this.requireDefinition()
    const state = this.requireState()
    for (const marker of definition.timeline.markers) {
      const alreadyFired = state.eventLog.some(
        (event) => event.payload.markerId === marker.id,
      )
      if (alreadyFired) continue
      if (state.clockMs < marker.timeMs) continue
      this.dispatch({
        type: marker.eventType ?? 'timeline.marker',
        source: 'timeline',
        nodeId: state.currentNodeId,
        payload: { markerId: marker.id, label: marker.label },
      })
    }
  }

  private record(input: NewActivityEvent): ActivityEvent {
    const definition = this.requireDefinition()
    const state = this.requireState()
    const event = this.events.createEvent(input, state.clockMs)
    state.eventLog.push(event)
    state.score = this.scoring.applyEvent(
      event,
      definition.scoring,
      definition.decisions,
      state,
    )
    this.events.emit(event)
    this.adapter.onEvent(event)
    return event
  }

  private createContext(): EngineContext {
    const definition = this.requireDefinition()
    const state = this.requireState()
    return {
      definition,
      state,
      emit: (event) => {
        this.dispatch(event)
        return state.eventLog[state.eventLog.length - 1]
      },
      getVariable: (name) => state.variables[name],
      setVariable: (name, value) => {
        state.variables[name] = value
        this.dispatch({
          type: 'variable.changed',
          source: 'engine',
          nodeId: state.currentNodeId,
          payload: { name, value },
        })
      },
    }
  }

  private requireDefinition(): ActivityDefinition {
    if (!this.definition) {
      throw new Error('No activity definition loaded')
    }
    return this.definition
  }

  private requireState(): RuntimeState {
    if (!this.state) {
      throw new Error('No runtime state. Load and start an activity first.')
    }
    return this.state
  }

  private requireRunning(): RuntimeState {
    const state = this.requireState()
    if (state.status !== 'running') {
      throw new Error('Activity is not running')
    }
    return state
  }
}
