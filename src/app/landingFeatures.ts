export const LANDING_NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it Works' },
  { href: '#demos', label: 'Demos' },
  { href: '#faq', label: 'FAQs' },
] as const

export const LANDING_FEATURES = [
  {
    title: 'Spot Hazards In Real Video',
    description:
      'Train with real driving footage. Learners tap hazards as they develop and build sharper roadside awareness.',
    visual: 'hazards',
  },
  {
    title: 'Interactive Coaching Lessons',
    description:
      'Guided activities teach safer decision-making with clear objectives, pacing, and practice built in.',
    visual: 'lessons',
  },
  {
    title: 'Instant Feedback That Sticks',
    description:
      'Get immediate coaching after every attempt so drivers understand what they missed and why it matters.',
    visual: 'feedback',
  },
  {
    title: 'Insights That Drive Growth',
    description:
      'Track progress across sessions, surface weak spots, and show measurable improvement over time.',
    visual: 'insights',
  },
  {
    title: 'Multiple Training Modes',
    description:
      'Mix hazard perception, reaction-time drills, and scenario practice to cover how drivers actually think.',
    visual: 'modes',
  },
  {
    title: 'Built For Fleets & Schools',
    description:
      'Scale from a single demo to full programs without losing clarity, consistency, or learner engagement.',
    visual: 'scale',
  },
] as const

export type LandingFeatureVisual = (typeof LANDING_FEATURES)[number]['visual']

export const LANDING_FAQS = [
  {
    q: 'Who is this demo for?',
    a: 'Fleet trainers, driving schools, and safety leaders evaluating AI-powered hazard perception coaching.',
  },
  {
    q: 'Do I need an account?',
    a: 'You can browse the full catalog freely. Starting some demos may ask you to sign in.',
  },
  {
    q: 'What devices work best?',
    a: 'Desktop and tablets work great. Many activities are also designed for smartphone practice.',
  },
] as const
