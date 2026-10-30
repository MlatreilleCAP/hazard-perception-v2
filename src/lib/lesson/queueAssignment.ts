export const MANAGING_EDITOR_NAME = 'Steven Turney'
export const APPROVER_NAME = 'Matt Latreille'

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function matchesPerson(name: string, email: string, tokens: string[]): boolean {
  const compactName = compact(name)
  const local = compact(email.split('@')[0] ?? '')
  return tokens.every((token) => compactName.includes(token) || local.includes(token))
}

export function isManagingEditor(name: string, email: string): boolean {
  return matchesPerson(name, email, ['steven', 'turney'])
}

export function isApprover(name: string, email: string): boolean {
  const local = compact(email.split('@')[0] ?? '')
  if (local === 'mlatreille' || compact(name) === 'mlatreille') return true
  return matchesPerson(name, email, ['matt', 'latreille']) || matchesPerson(name, email, ['latreille'])
}

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local.split(/[._-]+/).filter(Boolean)
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}
