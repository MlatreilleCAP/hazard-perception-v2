import { handleApplicationEmail } from './handler.ts'
import { createApplicationEmailDeps } from './repository.ts'

Deno.serve((request) => {
  return handleApplicationEmail(request, createApplicationEmailDeps(request.headers.get('Authorization')))
})
