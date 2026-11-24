import { describe, expect, it } from 'vitest'
import { normalizeAnticipateDefinition } from '@/types/anticipate'
import { normalizeProcessDefinition } from '@/types/process'
import { readQuestionBank, type ProcessQuestionBank } from '@/types/questions'

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

  it('shows the Dutch severity scale on the slider', () => {
    const bank = readQuestionBank({
      version: 2,
      questions: [
        {
          id: 'severity-nl',
          kind: 'theory',
          questionText: 'Hoe ernstig hadden de gevolgen kunnen zijn?',
          answers: [{ text: 'lage ernst' }, { text: 'matige ernst' }, { text: 'hoge ernst' }],
          correctIndex: 1,
        },
      ],
    })
    expect(bank.questions[0]?.kind).toBe('severity')
  })

  it('uses the slider for the third process and anticipate challenge question', () => {
    const bank: ProcessQuestionBank = {
      version: 2,
      questions: [0, 1, 2].map((index) => ({
        id: `q-${index}`,
        kind: 'theory' as const,
        questionText: `Question ${index + 1}`,
        answers: [
          { text: 'een lang antwoord over het verkeer', points: 0 },
          { text: 'nog een volledige zin als keuze', points: 0 },
          { text: 'een derde zin die geen schaal is', points: 0 },
        ],
        correctIndex: 1,
        explanation: '',
        correctExplanation: '',
        explanationWhen: 'incorrect' as const,
        showExplanation: true,
      })),
    }
    const process = normalizeProcessDefinition({
      version: 1,
      instructionText: '',
      instructionPill: '',
      instructionDesktopText: '',
      secondInstructionText: '',
      secondInstructionPill: '',
      segments: [
        {
          id: 'challenge',
          media: null,
          captions: null,
          durationMs: 0,
          questions: bank,
        },
        {
          id: 'coaching',
          media: null,
          captions: null,
          durationMs: 0,
          questions: bank,
        },
      ],
      secondSegmentScoreThreshold: null,
      thirdSegmentScoreThreshold: null,
    })
    const anticipate = normalizeAnticipateDefinition({
      version: 1,
      instructionText: '',
      instructionPill: '',
      instructionDesktopText: '',
      secondInstructionText: '',
      secondInstructionPill: '',
      segments: [
        {
          id: 'challenge',
          media: null,
          captions: null,
          durationMs: 0,
          questions: bank,
        },
      ],
      secondSegmentScoreThreshold: null,
      thirdSegmentScoreThreshold: null,
    })
    expect(process.segments[0]?.questions.questions.map((question) => question.kind)).toEqual([
      'theory',
      'theory',
      'severity',
    ])
    expect(process.segments[1]?.questions.questions[2]?.kind).toBe('theory')
    expect(anticipate.segments[0]?.questions.questions[2]?.kind).toBe('severity')
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
