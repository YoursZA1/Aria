import type { BusinessState } from '../types'
import { FOUNDER } from '../data/founder'
import { money } from '../lib/format'

const GOAL = FOUNDER.ultimateGoal

export function collectedRevenue(state: BusinessState): number {
  return state.invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
}

function overdueInLedger(state: BusinessState): number {
  return state.invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.amount, 0)
}

export function nextMilestone(collected: number): number {
  return GOAL.milestones.find((m) => collected < m) ?? GOAL.amount
}

export type GoalProgress = {
  amount: number
  collected: number
  remaining: number
  pct: number
  label: string
  metric: string
  next: number
  nextGap: number
  retainers: number
  overdue: number
  mtd: number
  monthsAtRunRate: number | null
  empty: boolean
  headline: string
  path: string[]
}

export function goalProgress(state: BusinessState): GoalProgress {
  const amount = GOAL.amount
  const collected = collectedRevenue(state)
  const remaining = Math.max(0, amount - collected)
  const pct = amount ? Math.min(100, Math.round((collected / amount) * 1000) / 10) : 0
  const next = nextMilestone(collected)
  const retainers = state.clients.reduce((s, c) => s + c.retainer, 0)
  const overdue = overdueInLedger(state)
  const mtd = state.company.revenueMtd
  const empty = state.invoices.length === 0 && collected === 0
  const monthsAtRunRate = retainers > 0 ? Math.ceil(remaining / retainers) : null

  const headline = empty
    ? `You are at ${money(0)} of ${money(amount)}. The ledger is empty until Paidly login or a real invoice — I will not pad this.`
    : collected >= amount
      ? `Collected ${money(collected)} — the R1 million cash milestone is hit. Now the job is profit, assets, and businesses that run without you.`
      : `${money(collected)} collected · ${pct}% of ${money(amount)} · ${money(remaining)} to go. Next milestone ${money(next)}.`

  const path = empty
    ? [
        'First rand: one paying BrandCafé client or one Paidly subscriber. Not a new app.',
        overdue > 0
          ? `Collect ${money(overdue)} already owed — that is the fastest move on the scoreboard.`
          : 'Connect Paidly books so collected cash is real, not homepage mock invoices.',
        'Lock retainers so income repeats (Level 3). Project-only work will never compound to R1m.',
        'Treat Paidly as the compounding engine (Level 4). Kill features that do not raise revenue, retention, or efficiency.',
        'Get repeating production off Mando. Founder hours on exports do not buy a million.',
        'Do not open a third company. Labs stay labs.',
      ]
    : [
        overdue > 0 ? `Collect ${money(overdue)} overdue first — already earned.` : 'Cash is current — do not leak it.',
        retainers > 0
          ? `Retainers ${money(retainers)}/mo. At this run-rate, ${monthsAtRunRate} months to R1m from retainers alone — Paidly must beat that.`
          : 'Convert delivery into retainers. Hours do not scale to R1m.',
        'Grow Paidly MRR. That is the asset. BrandCafé funds the climb.',
        'Improve what exists before exploring. A new brand resets you to R0 with extra overhead.',
      ]

  return {
    amount,
    collected,
    remaining,
    pct,
    label: GOAL.label,
    metric: GOAL.metric,
    next,
    nextGap: Math.max(0, next - collected),
    retainers,
    overdue,
    mtd,
    monthsAtRunRate,
    empty,
    headline,
    path,
  }
}

export function goalLine(state: BusinessState): string {
  const g = goalProgress(state)
  return `${g.label}: ${money(g.collected)} / ${money(g.amount)} (${g.pct}%) · next ${money(g.next)} · ${g.metric}`
}

export function servesGoal(idea: string): boolean {
  const t = idea.toLowerCase()
  if (/new (saas|app|product|agency|studio)|another (saas|product|brand)|start a (new )?(company|app)/.test(t)) return false
  if (/meridian|atlas coffee|veld electric|fake invoice|moodboard dump/.test(t)) return false
  return /invoice|paidly|retainer|collect|cash|revenue|subscriber|mrr|client|sell|proposal|quote|pricing|activation|churn|ledger/.test(t)
}
