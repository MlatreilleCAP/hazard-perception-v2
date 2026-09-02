import type { NodePlugin } from '@/nodes/types'
import {
  INTRODUCTION_NODE_TYPE,
  createDefaultIntroductionDefinition,
} from '@/types/introduction'

export const introductionVideoPlugin: NodePlugin<{
  introduction: ReturnType<typeof createDefaultIntroductionDefinition>
}> = {
  type: INTRODUCTION_NODE_TYPE,
  label: 'Stand Alone Video',
  category: 'content',
  createDefaultConfig: () => ({ introduction: createDefaultIntroductionDefinition() }),
}
