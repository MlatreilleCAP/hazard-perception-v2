export {}

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'auth' | 'app' | 'landing' | 'author'
    title?: string
    requiresAuth?: boolean
  }
}
