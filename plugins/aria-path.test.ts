import { describe, expect, it } from 'vitest'
import { ariaPathFromNodeUrl } from './aria-path.ts'

describe('ariaPathFromNodeUrl', () => {
  it('maps the Vercel rewrite onto the Vite plugin paths', () => {
    expect(ariaPathFromNodeUrl('/api/aria?__path=health')).toBe('/__aria/health')
    expect(ariaPathFromNodeUrl('/api/aria?__path=search&q=paidly')).toBe('/__aria/search?q=paidly')
    expect(ariaPathFromNodeUrl('/api/aria?__path=skills/match')).toBe('/__aria/skills/match')
    expect(ariaPathFromNodeUrl('/api/aria?__path=cursor/health')).toBe('/__aria/cursor/health')
  })

  it('maps a leftover catch-all URL if Vercel forwards nested segments', () => {
    expect(ariaPathFromNodeUrl('/api/aria/health')).toBe('/__aria/health')
    expect(ariaPathFromNodeUrl('/api/aria/search?q=paidly')).toBe('/__aria/search?q=paidly')
  })

  it('leaves local Vite paths unchanged', () => {
    expect(ariaPathFromNodeUrl('/__aria/think')).toBe('/__aria/think')
    expect(ariaPathFromNodeUrl('/__aria/read?url=https://example.com')).toBe('/__aria/read?url=https://example.com')
  })
})
