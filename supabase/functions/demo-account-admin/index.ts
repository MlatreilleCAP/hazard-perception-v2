import { handleDemoAdmin } from './handler.ts'
import { createDemoAdminDeps } from './repository.ts'

Deno.serve((request) => {
  return handleDemoAdmin(
    request,
    createDemoAdminDeps(request.headers.get('Authorization')),
    { localOrigins: Deno.env.get('DEMO_ADMIN_LOCAL_ORIGINS') },
  )
})
