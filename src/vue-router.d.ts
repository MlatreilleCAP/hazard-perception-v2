export {}

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'auth' | 'app' | 'landing' | 'author' | 'player'
    title?: string
    requiresAuth?: boolean
    /** Admin and author only; demo and sales users are redirected away. */
    requiresStudio?: boolean
    /** Admin only. Studio stays available to authors. */
    requiresAdmin?: boolean
    /** Administrators and sales. Sales are limited to this section. */
    requiresDemoAccounts?: boolean
  }
}
