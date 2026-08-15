import type {
  BusinessState,
  EngineerLevel,
  EngineerWriteMode,
  EvalSnapshot,
  ImprovementReport,
  ImprovementTicket,
} from '../types'
import { FOUNDER } from '../data/founder'
import { collectedRevenue } from './goal'
import { uid } from '../lib/format'
import { mandoToday } from './founder'

const MIN_SAMPLE = 5

const LOCKED =
  /\b(merge to main|merge into main|git merge|gh pr merge|deploy to production|production deploy|vercel deploy|force.?push|delete (all )?(the )?data|drop table|spend money|buy ads)\b/i

const SENSITIVE =
  /\b(database migrat|schema migrat|\bauth\b|oauth|authentication|payment system|stripe|payfast|paypal|checkout|billing gateway|security rules?)\b/i

export function johannesburgDay(at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

export function classifyLevel(task: string): EngineerLevel {
  const t = task.toLowerCase()
  if (LOCKED.test(t) || SENSITIVE.test(t)) return 3
  if (/\b(branch|commit|pull request|\bpr\b|modify code|write code|refactor|implement|patch|typecheck|lint|build the app)\b/.test(t)) return 2
  return 1
}

export function isForbiddenAutonomous(task: string): boolean {
  return LOCKED.test(task)
}

export type GateInput = {
  writeMode: EngineerWriteMode
  source: 'chat' | 'autopilot' | 'kernel'
  approvedIds?: string[]
  ticketId?: string
  level3Approved?: boolean
}

export function gateTask(task: string, input: GateInput): { ok: boolean; level: EngineerLevel; reason: string } {
  const level = classifyLevel(task)
  if (LOCKED.test(task)) {
    return {
      ok: false,
      level: 3,
      reason: 'Merge, deploy, deleting data, and spend stay with you — even after Level 3 approval. Approval lets me write auth, payments, migrations, or security on a branch. You merge.',
    }
  }
  if (level === 3) {
    const approved =
      Boolean(input.level3Approved) ||
      (input.ticketId ? Boolean(input.approvedIds?.includes(input.ticketId)) : false)
    if (!approved) {
      return {
        ok: false,
        level,
        reason: 'Level 3 — say “level 3 approved” before I touch auth, payments, migrations, or security rules. I still will not merge or deploy.',
      }
    }
  }
  if (level === 2 && input.source === 'autopilot' && input.writeMode !== 'branch') {
    return {
      ok: false,
      level,
      reason: 'Level 2 writes are off. Autopilot may analyse, ticket, and plan — not rewrite production. Turn on “Branch writes” or say “build yourself” for one bounded job.',
    }
  }
  return {
    ok: true,
    level,
    reason:
      level === 1
        ? 'Level 1 — observe only.'
        : level === 3
          ? 'Level 3 approved — branch only. You merge.'
          : 'Level 2 — branch, test, PR. No merge.',
  }
}

function rate(ok: number, n: number): number | null {
  if (n < MIN_SAMPLE) return null
  return Math.round((ok / n) * 1000) / 10
}

export function evaluate(state: BusinessState, testPass: number | null = null): EvalSnapshot {
  const assistants = state.messages.filter((m) => m.role === 'assistant' && m.intent && m.intent !== 'hello')
  const reasoned = assistants.filter((m) => m.intent && m.intent !== 'fallback').length
  const runs = state.cursorHistory ?? []
  const done = runs.filter((r) => r.status === 'finished' || r.status === 'error')
  const toolOk = runs.filter((r) => r.status === 'finished').length
  const knowledge = state.knowledge ?? []
  const researchOk = knowledge.filter((k) => k.url && k.takeaway.trim().length >= 40).length
  const users = state.messages.filter((m) => m.role === 'user')
  const missN = new Set((state.misses ?? []).map((m) => m.toLowerCase().trim())).size
  const relevant = users.length ? Math.max(0, users.length - missN) : 0

  const notes: string[] = []
  if (assistants.length < MIN_SAMPLE) notes.push(`Reasoning sample ${assistants.length} < ${MIN_SAMPLE} — not a fake 92%.`)
  if (done.length < MIN_SAMPLE) notes.push(`Tool-call sample ${done.length} < ${MIN_SAMPLE}.`)
  if (knowledge.length < MIN_SAMPLE) notes.push(`Research sample ${knowledge.length} < ${MIN_SAMPLE}.`)
  if (users.length < MIN_SAMPLE) notes.push(`Relevance sample ${users.length} < ${MIN_SAMPLE}.`)
  if (testPass === null) notes.push('Test pass rate unknown until /__aria/engineer/checks runs.')
  notes.push('I will not invent evaluation percentages.')

  return {
    at: new Date().toISOString(),
    sample: Math.max(assistants.length, done.length, knowledge.length, users.length),
    reasoningAccuracy: rate(reasoned, assistants.length),
    toolCallSuccess: rate(toolOk, done.length),
    researchAccuracy: rate(researchOk, knowledge.length),
    responseRelevance: rate(relevant, users.length),
    testPass,
    avgReplyMs: null,
    notes: notes.slice(0, 6),
  }
}

export function formatEval(e: EvalSnapshot): string[] {
  const pct = (n: number | null, label: string) => (n === null ? `${label}: insufficient data` : `${label}: ${n}%`)
  return [
    pct(e.reasoningAccuracy, 'Reasoning (non-fallback replies)'),
    pct(e.toolCallSuccess, 'Tool-call success (Cursor finished vs error)'),
    pct(e.researchAccuracy, 'Research (notes with URL + takeaway)'),
    pct(e.responseRelevance, 'Response relevance (1 − unique misses / user asks)'),
    e.testPass === null ? 'Tests: not run this cycle' : `Tests: ${e.testPass}% pass`,
    e.avgReplyMs === null ? 'Latency: not instrumented' : `Avg reply: ${e.avgReplyMs}ms`,
  ]
}

function metricList(e: EvalSnapshot): (number | null)[] {
  return [e.reasoningAccuracy, e.toolCallSuccess, e.researchAccuracy, e.responseRelevance, e.testPass]
}

export function compareEval(prev: EvalSnapshot | undefined, next: EvalSnapshot): ImprovementReport['vsPrev'] {
  if (!prev) return 'insufficient'
  const pairs = metricList(prev).map((a, i) => [a, metricList(next)[i]] as const)
  const usable = pairs.filter(([a, b]) => a !== null && b !== null) as [number, number][]
  if (usable.length < 2) return 'insufficient'
  if (usable.some(([a, b]) => b < a - 2)) return 'regressed'
  if (usable.some(([a, b]) => b > a + 2)) return 'improved'
  return 'unchanged'
}

function ticket(
  area: ImprovementTicket['area'],
  problem: string,
  cause: string,
  improvement: string,
  benefit: string,
  risk: ImprovementTicket['risk'],
  level: EngineerLevel,
): ImprovementTicket {
  return {
    id: `imp-${problem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42)}`,
    area,
    problem,
    cause,
    improvement,
    benefit,
    risk,
    level,
    status: level === 3 ? 'needs_approval' : 'proposed',
    at: new Date().toISOString(),
  }
}

export function detectTickets(state: BusinessState): ImprovementTicket[] {
  const tickets: ImprovementTicket[] = []
  const assistants = state.messages.filter((m) => m.role === 'assistant')
  const fallbacks = assistants.filter((m) => m.intent === 'fallback').length
  const misses = state.misses ?? []
  const cursorFail = (state.cursorHistory ?? []).filter((r) => r.status === 'error')
  const weakResearch = (state.knowledge ?? []).filter((k) => !k.url || k.takeaway.trim().length < 40)
  const open = (state.findings ?? []).filter((f) => f.status === 'open')
  const collected = collectedRevenue(state)
  const mine = mandoToday(state)

  if (fallbacks >= 2 || misses.length >= 2) {
    tickets.push(
      ticket(
        'ai',
        'Bad or missing answers (fallback / misses)',
        'Handlers or retrieval miss the ask; GPT fallback invents or shrugs.',
        'Add a brain/query handler for the repeated miss. Prefer retrieve over generate.',
        'Fewer hallucinations and fewer “I don’t have that yet” loops.',
        'low',
        2,
      ),
    )
  }

  if (weakResearch.length >= 2) {
    tickets.push(
      ticket(
        'ai',
        'Web research sometimes returns thin or uncited sources',
        'Search query generation is too broad, or takeaways are stored without a URL.',
        'Tighten query refinement and drop hits without a usable URL + takeaway.',
        'Higher research accuracy on BrandCafé / Paidly questions.',
        'low',
        2,
      ),
    )
  }

  if (cursorFail.length >= 1) {
    tickets.push(
      ticket(
        'code',
        'Cursor runs are failing',
        cursorFail[0]?.error || 'A coding-agent run ended in error.',
        'Read the error, bound the next job, typecheck. Do not retry vanity.',
        'Tool-call success goes up. Failed runs stop burning the API.',
        'med',
        2,
      ),
    )
  }

  if (open.some((f) => f.severity === 'critical' || f.severity === 'warn')) {
    const top = open.find((f) => f.severity === 'critical') ?? open.find((f) => f.severity === 'warn')
    tickets.push(
      ticket(
        'code',
        top?.title ?? 'Open kernel finding',
        top?.detail ?? 'Kernel still has an open wound.',
        'Fix in a feature branch. Tests + lint + typecheck. Open a PR. Do not merge.',
        'Integrity and reliability of the OS.',
        'med',
        2,
      ),
    )
  }

  if (collected === 0) {
    tickets.push(
      ticket(
        'business',
        'Empty ledger — R0 of R1 million',
        'No Paidly login / real invoices in this OS. Homepage mocks are not books.',
        'Connect Paidly receivables or add a real invoice. Do not invent demo clients.',
        'Aria can score cash toward R1m instead of guessing.',
        'low',
        1,
      ),
    )
  }

  if (mine.length >= 3) {
    tickets.push(
      ticket(
        'business',
        'Mando is still the production bottleneck',
        'Repeating delivery sits on the founder. That does not compound to R1m.',
        'Systemise or delegate the repeating tasks. Do not add a third company.',
        'Founder hours move to sales and Paidly.',
        'med',
        1,
      ),
    )
  }

  if ((state.writeMode ?? 'branch') === 'off') {
    tickets.push(
      ticket(
        'code',
        'Coding agent writes are paused',
        'Branch writes is off. Autopilot will not implement.',
        'Turn Branch writes on, or say “build yourself” for one Level 2 job. Never auto-merge.',
        'She codes when you want her to, and stays Level 1 when you pause her.',
        'low',
        1,
      ),
    )
  }

  if (!state.level3Approved) {
    tickets.push(
      ticket(
        'code',
        'Changing Paidly payments, auth, or deploy',
        'Money and identity paths can lose cash or lock Mando out.',
        'Any such change stays a Level 3 ticket until Mando says “level 3 approved”, then a PR, then Mando merges.',
        'Paidly stays safe while Aria still ships OS improvements.',
        'high',
        3,
      ),
    )
  }

  const seen = new Set<string>()
  return tickets.filter((t) => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  }).slice(0, 6)
}

export function mergeTickets(existing: ImprovementTicket[], incoming: ImprovementTicket[]): ImprovementTicket[] {
  const byId = new Map(existing.map((t) => [t.id, t]))
  for (const t of incoming) {
    const prev = byId.get(t.id)
    if (!prev) {
      byId.set(t.id, t)
      continue
    }
    if (prev.status === 'merged' || prev.status === 'rejected' || prev.status === 'rolled_back') continue
    byId.set(t.id, { ...prev, problem: t.problem, cause: t.cause, improvement: t.improvement, benefit: t.benefit, level: t.level, risk: t.risk })
  }
  return [...byId.values()].slice(0, 24)
}

export function runImprovementCycle(state: BusinessState, testPass: number | null = null): { state: BusinessState; report: ImprovementReport } {
  const evalNow = evaluate(state, testPass)
  const prev = state.evals?.[0]
  const vsPrev = compareEval(prev, evalNow)
  const fresh = detectTickets(state)
  const tickets = mergeTickets(state.tickets ?? [], fresh)
  const code = [
    `${(state.findings ?? []).filter((f) => f.status === 'open').length} open kernel findings.`,
    `${(state.cursorHistory ?? []).filter((r) => r.status === 'error').length} Cursor errors in history.`,
    'GitHub is the source of truth. Writes belong on aria/improve-* branches, then a PR. Mando merges.',
  ]
  const ai = [
    `${(state.misses ?? []).length} unique misses stored.`,
    `${(state.messages ?? []).filter((m) => m.intent === 'fallback').length} fallback replies.`,
    `${(state.knowledge ?? []).length} web notes — thin notes without URLs do not count as research.`,
  ]
  const business = [
    `Scoreboard: R${collectedRevenue(state).toLocaleString('en-ZA')} of R${FOUNDER.ultimateGoal.amount.toLocaleString('en-ZA')} collected.`,
    state.invoices.length === 0 ? 'Ledger empty until Paidly login or a real invoice.' : `${state.invoices.length} invoices in the OS.`,
    `${mandoToday(state).length} items due today still on Mando.`,
  ]

  const l2 = tickets.filter((t) => t.level === 2 && t.status === 'proposed').length
  const l3 = tickets.filter((t) => t.level === 3 && t.status === 'needs_approval').length
  const summary =
    vsPrev === 'regressed'
      ? 'Latest eval regressed versus the previous snapshot. I will not claim I improved. Reject or roll back the last write — Mando merges or reverts.'
      : `I identified ${tickets.filter((t) => t.status === 'proposed' || t.status === 'needs_approval').length} live improvements. ${l2} are Level 2 (branch + PR if you turn Branch writes on or say build). ${l3} need Mando’s approval. Autopilot does not merge.`

  const report: ImprovementReport = {
    id: uid('rep'),
    at: new Date().toISOString(),
    code,
    ai,
    business,
    tickets: fresh,
    eval: evalNow,
    vsPrev,
    summary,
  }

  return {
    state: {
      ...state,
      tickets,
      reports: [report, ...(state.reports ?? [])].slice(0, 14),
      evals: [evalNow, ...(state.evals ?? [])].slice(0, 14),
      lastImproveAt: report.at,
      activity: [{ id: uid('log'), text: `Aria engineer cycle: ${summary}`, at: report.at }, ...state.activity],
    },
    report,
  }
}

export function maybeNightlyImprove(state: BusinessState): BusinessState {
  const last = state.lastImproveAt
  if (last && johannesburgDay(new Date(last)) === johannesburgDay()) return state
  return runImprovementCycle(state).state
}

export function approveTicket(state: BusinessState, ticketId: string): BusinessState {
  const approvedTicketIds = [...new Set([...(state.approvedTicketIds ?? []), ticketId])]
  return {
    ...state,
    approvedTicketIds,
    tickets: (state.tickets ?? []).map((t) => (t.id === ticketId ? { ...t, status: 'planned' as const } : t)),
    activity: [{ id: uid('log'), text: `Mando approved Level 3 ticket ${ticketId}. Still a PR — I do not merge.`, at: new Date().toISOString() }, ...state.activity],
  }
}

export function parseLevel3Approval(t: string): boolean {
  return /level\s*3\s+(is\s+)?approved|approv(e|ed|al)\s+level\s*3|\bl3\s+approved|i approve (level\s*)?3|grant(ed)? level\s*3/.test(t.toLowerCase())
}

export function approveLevel3(state: BusinessState): BusinessState {
  const l3 = (state.tickets ?? []).filter(
    (t) => t.level === 3 && t.status !== 'merged' && t.status !== 'rejected' && t.status !== 'rolled_back',
  )
  const ids = l3.map((t) => t.id)
  return {
    ...state,
    level3Approved: true,
    level3ApprovedAt: new Date().toISOString(),
    approvedTicketIds: [...new Set([...(state.approvedTicketIds ?? []), ...ids])],
    tickets: (state.tickets ?? []).map((t) => (ids.includes(t.id) ? { ...t, status: 'planned' as const } : t)),
    activity: [
      {
        id: uid('log'),
        text: 'Mando approved Level 3. Auth, payments, migrations, and security may go on a branch. Merge and deploy stay with Mando.',
        at: new Date().toISOString(),
      },
      ...state.activity,
    ],
  }
}

export function parseWriteMode(t: string): EngineerWriteMode | undefined {
  if (/branch writes? off|write mode off|stop (writing|rewriting) (code|yourself)|observe only|level 1 only/.test(t)) return 'off'
  if (/branch writes? on|write on a branch|level 2 writes|you may (write|implement) on a branch/.test(t)) return 'branch'
  return undefined
}

export function isEngineerAsk(t: string): boolean {
  const n = t.toLowerCase()
  if (parseLevel3Approval(n)) return true
  if (/self[- ]improv|improve yourself|improvement (cycle|report|loop)|engineer (cycle|report)|ai health|code health/.test(n)) return true
  if (/permission levels?|level [123] (autonomous|controlled|approval|approved)|write mode|branch writes/.test(n)) return true
  if (/software engineer skill|evaluation (system|scores|metrics)|eval snapshot/.test(n)) return true
  if (/improvement log|ai_improvement_log/.test(n)) return true
  return false
}
