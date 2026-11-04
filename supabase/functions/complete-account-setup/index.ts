import { handleAccountSetup } from './handler.ts'
import { createSetupDeps } from './repository.ts'

Deno.serve((request) => {
  return handleAccountSetup(
    request,
    createSetupDeps(request.headers.get('Authorization')),
    Deno.env.get('DEMO_ADMIN_LOCAL_ORIGINS'),
  )
})
