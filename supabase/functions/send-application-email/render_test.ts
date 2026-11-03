import { assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1'
import { ApplicationEmailError } from './errors.ts'
import { escapeHtml, missingRequiredVariables, renderEmailPart, testSubject } from './render.ts'

Deno.test('variable values are escaped in HTML and cannot inject markup', () => {
  const value = '<script>alert(1)</script>'
  const html = renderEmailPart('<p>Hello {{name}}</p>', { name: value }, 'html')
  assertStringIncludes(html, escapeHtml(value))
  assertEquals(html.includes('<script>'), false)
  assertEquals(html.includes('onerror'), false)
})

Deno.test('plain text keeps the characters without treating them as HTML', () => {
  const text = renderEmailPart('Hello {{name}}', { name: 'Alex & Jo' }, 'text')
  assertEquals(text, 'Hello Alex & Jo')
})

Deno.test('required variables must be present', () => {
  assertEquals(
    missingRequiredVariables(
      [{ key: 'name', required: true }, { key: 'note', required: false }],
      { note: 'optional' },
    ),
    ['name'],
  )
  assertThrows(
    () => {
      const missing = missingRequiredVariables([{ key: 'name', required: true }], {})
      if (missing.length > 0) {
        throw new ApplicationEmailError(400, `Missing required variables: ${missing.join(', ')}`)
      }
    },
    ApplicationEmailError,
    'name',
  )
})

Deno.test('a test subject is prefixed once', () => {
  assertEquals(testSubject('Hello {{name}}'), '[Test] Hello {{name}}')
  assertEquals(testSubject('[Test] Hello'), '[Test] Hello')
})
