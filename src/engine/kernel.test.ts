import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed'
import { uid, todayISO } from '../lib/format'
import { mandoToday } from './founder'
import { applyRepairs, evolve } from './kernel'

function founderPile(count: number) {
  const state = createSeed()
  const today = todayISO()
  state.tasks = Array.from({ length: count }, (_, i) => ({
    id: uid('t'),
    title: `Kickoff — Product ${i + 1}`,
    due: today,
    priority: 'med' as const,
    status: 'backlog' as const,
    assigneeId: 'p1',
    today: false,
    projectId: `live-pr${i + 1}`,
  }))
  return state
}

describe('founder bottleneck repair', () => {
  it('defers production tasks off Mando when the kernel finding is open', () => {
    const before = founderPile(4)
    expect(mandoToday(before).length).toBe(4)

    const { state: repaired } = applyRepairs(before)
    expect(mandoToday(repaired).length).toBeLessThan(3)
    expect(repaired.repairedIds).toContain('analyze-mando-bottleneck')
  })

  it('creates kickoff tasks deferred off today-board', () => {
    const state = {
      ...createSeed(),
      projects: [
        {
          id: 'live-pr1',
          clientId: 'live-self',
          name: 'Paidly',
          status: 'live' as const,
          due: todayISO(),
          daysBehind: 0,
          ownerId: 'p1',
          brief: 'Live product',
          deliverables: [],
        },
      ],
    }
    const { state: repaired } = applyRepairs(state)
    const kickoff = repaired.tasks.find((t) => t.title.startsWith('Kickoff —'))
    expect(kickoff).toBeDefined()
    expect(kickoff?.due).not.toBe(todayISO())
    expect(kickoff?.priority).toBe('low')
  })

  it('closes the bottleneck finding after evolve', () => {
    const after = evolve(founderPile(4))
    const finding = after.findings.find((f) => f.id === 'analyze-mando-bottleneck')
    expect(finding?.status).not.toBe('open')
  })
})
