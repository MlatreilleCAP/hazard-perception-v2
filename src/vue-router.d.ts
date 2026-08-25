export {}

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'auth' | 'app' | 'landing' | 'author' | 'player'
    title?: string
    requiresAuth?: boolean
  }
}
