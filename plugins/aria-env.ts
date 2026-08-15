/** Server env for /__aria. Never import vite here — Vercel cannot load its native bindings. */

export function envValue(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function googleCreds() {
  return {
    key: envValue('GOOGLE_CSE_API_KEY', 'GOOGLE_API_KEY'),
    cx: envValue('GOOGLE_CSE_CX', 'GOOGLE_CSE_ID'),
  }
}

export function openaiKey() {
  return envValue('OPENAI_API_KEY')
}

export function cursorKey() {
  return envValue('CURSOR_API_KEY')
}

export function paidlyCwd() {
  return envValue('ARIA_PAIDLY_CWD')
}

export function brandcafeCwd() {
  return envValue('ARIA_BRANDCAFE_CWD')
}
