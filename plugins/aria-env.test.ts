import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cursorKey, envValue, googleCreds, openaiKey } from './aria-env.ts'

describe('aria-env', () => {
  it('reads the first non-empty process.env key', () => {
    const prev = process.env.ARIA_ENV_TEST_A
    const prevB = process.env.ARIA_ENV_TEST_B
    process.env.ARIA_ENV_TEST_A = '  one  '
    process.env.ARIA_ENV_TEST_B = 'two'
    expect(envValue('ARIA_ENV_TEST_A', 'ARIA_ENV_TEST_B')).toBe('one')
    process.env.ARIA_ENV_TEST_A = prev
    process.env.ARIA_ENV_TEST_B = prevB
  })

  it('maps Google / OpenAI / Cursor keys without inventing values', () => {
    expect(googleCreds()).toEqual({
      key: envValue('GOOGLE_CSE_API_KEY', 'GOOGLE_API_KEY'),
      cx: envValue('GOOGLE_CSE_CX', 'GOOGLE_CSE_ID'),
    })
    expect(openaiKey()).toBe(envValue('OPENAI_API_KEY'))
    expect(cursorKey()).toBe(envValue('CURSOR_API_KEY'))
  })

  it('keeps vite out of the Vercel function graph', () => {
    const files = [
      'api/aria.ts',
      'plugins/aria-serve.ts',
      'plugins/aria-path.ts',
      'plugins/aria-env.ts',
      'plugins/aria-browser.ts',
      'plugins/aria-cursor.ts',
      'plugins/aria-skills.ts',
      'plugins/aria-code.ts',
      'plugins/aria-engineer.ts',
    ]
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/from ['"]vite['"]/)
    }
  })
})
