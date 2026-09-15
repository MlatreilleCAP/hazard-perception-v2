import { getSupabase } from '@/services/supabase'
import {
  INROADS_SCORING_SETTING_KEY,
  INROADS_SCORING_STORAGE_KEY,
  defaultInroadsScoringPoints,
  normalizeInroadsScoringPoints,
  pointsForInroadsQuestion,
  type InroadsScoringPoints,
  type InroadsScoringSection,
} from '@/types/inroadsScoring'
import type { ProcessSurveyQuestion, QuestionPointsFn } from '@/types/questions'

let cached = defaultInroadsScoringPoints()
let loaded = false
let loadPromise: Promise<InroadsScoringPoints> | null = null

function readLocal(): InroadsScoringPoints | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(INROADS_SCORING_STORAGE_KEY)
    if (!raw) return null
    return normalizeInroadsScoringPoints(JSON.parse(raw) as Partial<InroadsScoringPoints>)
  } catch {
    return null
  }
}

function writeLocal(points: InroadsScoringPoints): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(INROADS_SCORING_STORAGE_KEY, JSON.stringify(points))
}

export function getInroadsScoringPoints(): InroadsScoringPoints {
  return cached
}

export function inroadsQuestionPointsFn(
  section: InroadsScoringSection,
  segment: 1 | 2,
  questions: readonly ProcessSurveyQuestion[],
): QuestionPointsFn {
  const points = getInroadsScoringPoints()
  return (_question, index) =>
    pointsForInroadsQuestion(points, section, segment, questions, index)
}

export async function loadInroadsScoring(): Promise<InroadsScoringPoints> {
  if (loaded) return cached
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const local = readLocal()
    if (local) cached = local
    const client = getSupabase()
    if (client) {
      const { data, error } = await client
        .from('app_settings')
        .select('value')
        .eq('key', INROADS_SCORING_SETTING_KEY)
        .maybeSingle()
      if (!error && data && typeof data.value === 'object' && data.value) {
        cached = normalizeInroadsScoringPoints(data.value as Partial<InroadsScoringPoints>)
        writeLocal(cached)
      }
    }
    loaded = true
    return cached
  })()
  try {
    return await loadPromise
  } finally {
    loadPromise = null
  }
}

export async function saveInroadsScoring(
  points: InroadsScoringPoints,
): Promise<InroadsScoringPoints> {
  const next = normalizeInroadsScoringPoints(points)
  cached = next
  loaded = true
  writeLocal(next)
  const client = getSupabase()
  if (!client) return next
  const { data: userData } = await client.auth.getUser()
  const { error } = await client.from('app_settings').upsert(
    {
      key: INROADS_SCORING_SETTING_KEY,
      value: next,
      updated_at: new Date().toISOString(),
      updated_by: userData.user?.id ?? null,
    },
    { onConflict: 'key' },
  )
  if (error) {
    throw new Error(error.message)
  }
  return next
}
