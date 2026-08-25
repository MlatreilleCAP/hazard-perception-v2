/** Deep-clone JSON-safe values, including Vue/Pinia reactive proxies. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
