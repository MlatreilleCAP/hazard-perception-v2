import { createResendDeps, handleDemoRequest } from './handler.ts'

Deno.serve((request) =>
  handleDemoRequest(
    request,
    createResendDeps(Deno.env.get('RESEND_API_KEY')),
    Deno.env.get('DEMO_ADMIN_LOCAL_ORIGINS'),
  )
)
