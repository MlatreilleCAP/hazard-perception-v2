import { describe, expect, it } from 'vitest'
import { readQuestionBank } from '@/types/questions'

describe('severity scale questions', () => {
  it('shows Minor, Serious, and Critical on the severity slider', () => {
    const bank = readQuestionBank({
      version: 2,
      questions: [
        {
          id: 'severity-1',
          kind: 'theory',
          questionText: 'How severe would the outcome have been?',
          answers: [{ text: 'Minor' }, { text: 'Serious' }, { text: 'Critical' }],
          correctIndex: 1,
          explanation: 'A same-direction impact.',
          explanationWhen: 'always',
        },
      ],
    })
    expect(bank.questions[0]?.kind).toBe('severity')
  })

  it('keeps a written choice question as theory', () => {
    const bank = readQuestionBank({
      version: 2,
      questions: [
        {
          id: 'theory-1',
          kind: 'theory',
          questionText: 'What happens next?',
          answers: [
            { text: 'the vehicle closes up' },
            { text: 'you finish moving over' },
            { text: 'you pull back' },
          ],
          correctIndex: 1,
        },
      ],
    })
    expect(bank.questions[0]?.kind).toBe('theory')
  })
})
