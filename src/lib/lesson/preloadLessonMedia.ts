import { readAnticipateDefinition } from '@/activities/anticipateDefinition'
import { readProcessDefinition } from '@/activities/processDefinition'
import { readSeeDefinition } from '@/activities/seeDefinition'
import { runPool } from '@/lib/runPool'
import { MediaWarmPool, type WarmMediaKind, type WarmMediaRequest } from '@/lib/media/warmMedia'
import type { ActivityDefinition } from '@/types/activity'
import type { LessonCompositionItemKind } from '@/types/lesson'

export type LessonWarmTarget = {
  mediaId: string
  kind: WarmMediaKind
  /** Lower plays first. 0 = first clip of each section. */
  priority: number
}

function pushTarget(
  targets: LessonWarmTarget[],
  mediaId: string | null | undefined,
  kind: WarmMediaKind,
  priority: number,
): void {
  const id = mediaId?.trim()
  if (!id) return
  if (targets.some((target) => target.mediaId === id)) return
  targets.push({ mediaId: id, kind, priority })
}

export function collectLessonWarmTargets(
  introMediaId: string | null,
  sections: Array<{ kind: LessonCompositionItemKind; definition: ActivityDefinition }>,
): LessonWarmTarget[] {
  const targets: LessonWarmTarget[] = []
  pushTarget(targets, introMediaId, 'video', 0)

  for (const section of sections) {
    if (section.kind === 'see') {
      const see = readSeeDefinition(section.definition)
      pushTarget(targets, see.media?.media_asset_id, 'video', 0)
      pushTarget(targets, see.introAudio?.media_asset_id, 'audio', 1)
      for (const hazard of see.hazards) {
        pushTarget(targets, hazard.missedVideo?.media_asset_id, 'video', 1)
        pushTarget(targets, hazard.explanationImage?.media_asset_id, 'image', 2)
        pushTarget(targets, hazard.introAudio?.media_asset_id, 'audio', 2)
      }
      continue
    }

    const segments =
      section.kind === 'process'
        ? readProcessDefinition(section.definition).segments
        : readAnticipateDefinition(section.definition).segments
    segments.forEach((segment, index) => {
      pushTarget(targets, segment.media?.media_asset_id, 'video', index === 0 ? 0 : 1)
    })
  }

  return targets.sort((a, b) => a.priority - b.priority)
}

export async function signAndWarmLessonMedia(params: {
  targets: LessonWarmTarget[]
  getSignedUrl: (mediaId: string) => Promise<string>
  pool: MediaWarmPool
  signal?: AbortSignal
}): Promise<void> {
  const { targets, getSignedUrl, pool, signal } = params
  if (targets.length === 0) return

  const primary = targets.filter((target) => target.priority === 0)
  const rest = targets.filter((target) => target.priority !== 0)
  const urls = new Map<string, string>()

  await runPool(primary, 4, async (target) => {
    if (signal?.aborted) return
    try {
      urls.set(target.mediaId, await getSignedUrl(target.mediaId))
    } catch {
      /* section players still handle missing media */
    }
  })

  await runPool(primary, 2, async (target) => {
    if (signal?.aborted) return
    const url = urls.get(target.mediaId)
    if (!url) return
    await pool.warm({ url, kind: target.kind } satisfies WarmMediaRequest, 4_000, signal)
  })

  void runPool(rest, 4, async (target) => {
    if (signal?.aborted) return
    try {
      const url = await getSignedUrl(target.mediaId)
      await pool.warm({ url, kind: target.kind } satisfies WarmMediaRequest, 4_000, signal)
    } catch {
      /* unused clips can resolve later */
    }
  })
}
