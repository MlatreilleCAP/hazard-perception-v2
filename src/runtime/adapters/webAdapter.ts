import type { ActivityEvent } from '@/types/event'
import type { RuntimeAdapter, RuntimeState } from '@/types/runtime'

export class WebRuntimeAdapter implements RuntimeAdapter {
  readonly kind = 'web' as const

  onEvent(_event: ActivityEvent): void {}

  syncState(_state: Readonly<RuntimeState>): void {}
}
