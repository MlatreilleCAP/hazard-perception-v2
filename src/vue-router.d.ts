export {}

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'auth' | 'app' | 'landing'
    title?: string
    requiresAuth?: boolean
  }
}
