export {}

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'auth' | 'app'
    title?: string
    requiresAuth?: boolean
  }
}
