import { describe, expect, it } from 'vitest'
import { shouldUseGpt } from './openai.ts'

describe('shouldUseGpt', () => {
  it('sends conversational replies through ChatGPT', () => {
    for (const intent of ['fallback', 'today', 'unpaid', 'hello', 'decide', 'paidly', 'code', 'research']) {
      expect(shouldUseGpt(intent), intent).toBe(true)
    }
  })

  it('keeps mechanical OS actions local', () => {
    for (const intent of ['live-sync', 'ack', 'autopilot-off', 'cursor-cancel', 'write-mode', 'level3-approve']) {
      expect(shouldUseGpt(intent), intent).toBe(false)
    }
  })
})
