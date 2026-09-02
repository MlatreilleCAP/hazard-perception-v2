import { services } from '@/app/container'
import { runPool } from '@/lib/runPool'
import { collectMediaAssetIds, type MediaAsset } from '@/types/media'

export async function collectReferencedMediaAssetIds(): Promise<Set<string>> {
  const summaries = await services.persistence.list('authoring')
  const referenced = new Set<string>()
  await runPool(summaries, 6, async (summary) => {
    const [draft, published] = await Promise.all([
      services.persistence.getById(summary.id),
      services.persistence.getPublished(summary.id),
    ])
    for (const definition of [draft, published]) {
      if (!definition) continue
      for (const id of collectMediaAssetIds(definition)) {
        referenced.add(id)
      }
    }
  })
  return referenced
}

export async function listUnusedMediaAssets(): Promise<MediaAsset[]> {
  const [assets, referenced] = await Promise.all([
    services.media.listAssets(),
    collectReferencedMediaAssetIds(),
  ])
  return assets.filter((asset) => !referenced.has(asset.id))
}

export async function deleteUnusedMediaAssets(
  assets: MediaAsset[],
): Promise<{
  deleted: MediaAsset[]
  failures: Array<{ asset: MediaAsset; message: string }>
}> {
  const deleted: MediaAsset[] = []
  const failures: Array<{ asset: MediaAsset; message: string }> = []
  for (const asset of assets) {
    try {
      await services.media.deleteAsset(asset.id)
      deleted.push(asset)
    } catch (cause) {
      failures.push({
        asset,
        message: cause instanceof Error ? cause.message : 'Failed to delete',
      })
    }
  }
  return { deleted, failures }
}
