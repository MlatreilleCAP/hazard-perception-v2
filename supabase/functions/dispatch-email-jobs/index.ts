import { DispatchError } from './errors.ts'
import { handleDispatch } from './handler.ts'
import { createDispatcherDeps } from './repository.ts'

Deno.serve(async (request) => {
  try {
    return await handleDispatch(request, createDispatcherDeps())
  } catch (cause) {
    const error = cause instanceof DispatchError
      ? cause
      : new DispatchError(500, 'dispatch', 'Email dispatch failed.')
    console.error(JSON.stringify({ source: 'dispatch-email-jobs', status: error.status, code: error.code }))
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
