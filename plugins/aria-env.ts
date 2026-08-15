/** Server env for /__aria. Never import vite here — Vercel cannot load its native bindings. */

const STATIC = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CURSOR_API_KEY: process.env.CURSOR_API_KEY,
  GOOGLE_CSE_API_KEY: process.env.GOOGLE_CSE_API_KEY,
  GOOGLE_CSE_CX: process.env.GOOGLE_CSE_CX,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID,
  ARIA_PAIDLY_CWD: process.env.ARIA_PAIDLY_CWD,
  ARIA_BRANDCAFE_CWD: process.env.ARIA_BRANDCAFE_CWD,
}

export function envValue(...keys: string[]): string {
  for (const key of keys) {
    const value = STATIC[key as keyof typeof STATIC] ?? process.env[key]
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
