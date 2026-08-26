export type InstructionBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

const BULLET_PREFIX = /^\s*[-*•]\s+/

export function parseInstructionBlocks(text: string): InstructionBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: InstructionBlock[] = []
  let paragraphLines: string[] = []
  let listItems: string[] = []

  function flushParagraph(): void {
    const joined = paragraphLines.join('\n').trim()
    paragraphLines = []
    if (joined) blocks.push({ type: 'paragraph', text: joined })
  }

  function flushList(): void {
    if (listItems.length === 0) return
    blocks.push({ type: 'list', items: listItems })
    listItems = []
  }

  for (const line of lines) {
    if (BULLET_PREFIX.test(line)) {
      flushParagraph()
      listItems.push(line.replace(BULLET_PREFIX, '').trimEnd())
      continue
    }
    flushList()
    paragraphLines.push(line)
  }

  flushList()
  flushParagraph()
  return blocks
}
