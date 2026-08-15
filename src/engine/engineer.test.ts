import { describe, expect, it } from 'vitest'
import { approveLevel3, classifyLevel, compareEval, evaluate, gateTask, isForbiddenAutonomous, parseLevel3Approval } from './engineer'
import { createSeed } from '../data/seed'
import type { EvalSnapshot } from '../types'

function snap(partial: Partial<EvalSnapshot>): EvalSnapshot {
  return {
    at: '2026-08-15T00:00:00.000Z',
    sample: 10,
    reasoningAccuracy: null,
    toolCallSuccess: null,
    researchAccuracy: null,
    responseRelevance: null,
    testPass: null,
    avgReplyMs: null,
    notes: [],
    ...partial,
  }
}

describe('permission levels', () => {
  it('classifies merge/deploy/payments as Level 3', () => {
    expect(classifyLevel('merge to main')).toBe(3)
    expect(classifyLevel('deploy to production')).toBe(3)
    expect(classifyLevel('change the Stripe payment system')).toBe(3)
    expect(isForbiddenAutonomous('gh pr merge')).toBe(true)
  })

  it('classifies branch/PR work as Level 2', () => {
    expect(classifyLevel('create a branch and open a pull request')).toBe(2)
  })

  it('keeps analysis at Level 1', () => {
    expect(classifyLevel('analyse logs and suggest improvements')).toBe(1)
  })

  it('blocks Autopilot Level 2 when write mode is off', () => {
    const gate = gateTask('implement a patch and open a PR', { writeMode: 'off', source: 'autopilot' })
    expect(gate.ok).toBe(false)
    expect(gate.level).toBe(2)
  })

  it('allows Autopilot Level 2 when write mode is branch', () => {
    const gate = gateTask('implement a patch and open a PR', { writeMode: 'branch', source: 'autopilot' })
    expect(gate.ok).toBe(true)
    expect(gate.level).toBe(2)
  })

  it('allows Mando-triggered Level 2 from chat', () => {
    const gate = gateTask('implement a patch and open a PR', { writeMode: 'off', source: 'chat' })
    expect(gate.ok).toBe(true)
  })

  it('blocks merge/deploy even after Level 3 approval', () => {
    const gate = gateTask('deploy to production', { writeMode: 'branch', source: 'chat', level3Approved: true })
    expect(gate.ok).toBe(false)
    expect(gate.level).toBe(3)
  })

  it('allows auth/payment implementation on a branch after Level 3 approval', () => {
    const gate = gateTask('change the Stripe payment system', { writeMode: 'branch', source: 'chat', level3Approved: true })
    expect(gate.ok).toBe(true)
    expect(gate.level).toBe(3)
  })

  it('does not treat a normal job title as Level 3', () => {
    expect(classifyLevel('Work on Paidly')).toBe(1)
    const gate = gateTask('Work on Paidly', { writeMode: 'branch', source: 'chat' })
    expect(gate.ok).toBe(true)
  })

  it('blocks payment work until Level 3 is approved', () => {
    const gate = gateTask('change the Stripe payment system', { writeMode: 'branch', source: 'chat' })
    expect(gate.ok).toBe(false)
  })

  it('parses Mando saying level 3 approved', () => {
    expect(parseLevel3Approval('level 3 approved')).toBe(true)
    expect(parseLevel3Approval('I approve level 3')).toBe(true)
    expect(parseLevel3Approval('build yourself')).toBe(false)
  })

  it('records Level 3 approval on the OS', () => {
    const next = approveLevel3(createSeed())
    expect(next.level3Approved).toBe(true)
  })
})

describe('eval honesty', () => {
  it('returns null metrics when the sample is too small', () => {
    const e = evaluate(createSeed())
    expect(e.reasoningAccuracy).toBeNull()
    expect(e.toolCallSuccess).toBeNull()
    expect(e.notes.some((n) => /invent/i.test(n))).toBe(true)
  })

  it('flags a regression when a metric drops more than 2 points', () => {
    expect(compareEval(snap({ reasoningAccuracy: 90, toolCallSuccess: 90 }), snap({ reasoningAccuracy: 80, toolCallSuccess: 90 }))).toBe('regressed')
  })

  it('flags an improvement when a metric rises', () => {
    expect(compareEval(snap({ reasoningAccuracy: 80, toolCallSuccess: 90 }), snap({ reasoningAccuracy: 90, toolCallSuccess: 90 }))).toBe('improved')
  })
})
