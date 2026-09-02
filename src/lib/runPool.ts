export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (true) {
        const index = next
        next += 1
        if (index >= items.length) return
        results[index] = await worker(items[index] as T, index)
      }
    },
  )
  await Promise.all(runners)
  return results
}
