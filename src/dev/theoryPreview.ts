import { createApp, h, ref } from 'vue'
import ProcessSeverityPopover from '@/components/process/ProcessSeverityPopover.vue'
import ProcessTheoryPopover from '@/components/process/ProcessTheoryPopover.vue'
import {
  EXPLANATION_WHEN_OPTIONS,
  type ExplanationWhen,
  type ProcessSurveyQuestion,
} from '@/types/questions'
import '../style.css'
import '../app/player.css'

const question = ref<ProcessSurveyQuestion>({
  id: 'preview-1',
  kind: 'theory',
  questionText: 'You are approaching a pedestrian crossing on a wet road. What should you do first?',
  answers: [
    { text: 'Sound the horn to warn the pedestrian waiting at the kerb', points: 0 },
    { text: 'Ease off the accelerator and cover the brake early', points: 1 },
    { text: 'Maintain your speed and steer around the crossing', points: 0 },
    { text: 'Brake hard as soon as you reach the crossing markings', points: 0 },
  ],
  correctIndex: 1,
  explanation:
    'Easing off early gives you the longest stopping distance on a wet surface and signals your intent to the pedestrian without startling them.',
  explanationWhen: 'incorrect',
  showExplanation: true,
})

const severityQuestion = ref<ProcessSurveyQuestion>({
  id: 'severity-1',
  kind: 'severity',
  questionText: 'How dangerous do you think this hazard was?',
  answers: [
    { text: 'Low', points: 0 },
    { text: 'Medium', points: 10 },
    { text: 'High', points: 0 },
  ],
  correctIndex: 1,
  explanation:
    'The closing speed and limited space to escape made this a medium-severity hazard.',
  showExplanation: true,
})

const key = ref(0)
const severityKey = ref(0)

createApp({
  render: () =>
    h('div', { class: 'process-experience', style: 'padding: 40px 0; background: #ddd' }, [
      h(
        'label',
        { style: 'display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:16px;font:14px/1.4 system-ui' },
        [
          'Show explanation text',
          h(
            'select',
            {
              value: question.value.explanationWhen ?? 'incorrect',
              onChange: (event: Event) => {
                const explanationWhen = (event.target as HTMLSelectElement)
                  .value as ExplanationWhen
                key.value += 1
                question.value = {
                  ...question.value,
                  id: `preview-${key.value}`,
                  explanationWhen,
                  showExplanation: explanationWhen !== 'never',
                }
              },
            },
            EXPLANATION_WHEN_OPTIONS.map((option) =>
              h('option', { value: option.value }, option.label),
            ),
          ),
        ],
      ),
      h('div', { class: 'process-question-layer' }, [
        h(ProcessTheoryPopover, {
          key: key.value,
          question: question.value,
          onComplete: () => {
            key.value += 1
            question.value = { ...question.value, id: `preview-${key.value}` }
          },
        }),
      ]),
      h('div', { class: 'process-question-layer', style: 'margin-top: 32px' }, [
        h(ProcessSeverityPopover, {
          key: severityKey.value,
          question: severityQuestion.value,
          onComplete: () => {
            severityKey.value += 1
            severityQuestion.value = {
              ...severityQuestion.value,
              id: `severity-${severityKey.value}`,
            }
          },
        }),
      ]),
    ]),
}).mount('#preview')
