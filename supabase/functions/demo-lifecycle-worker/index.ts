import { handleLifecycleWorker } from './handler.ts'
import { createLifecycleWorkerDeps } from './repository.ts'

Deno.serve((request) => {
  return handleLifecycleWorker(request, createLifecycleWorkerDeps(request.headers.get('Authorization')))
})
