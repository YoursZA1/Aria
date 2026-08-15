import type { AgentId, BusinessState, ProposedAction } from '../types'
import { FOUNDER } from '../data/founder'
import { money, uid } from '../lib/format'
import { analyze, evolve } from './kernel'
import { goalProgress } from './goal'
import {
  detectNotices,
  detectOpportunities,
  formatVerdict,
  isDelegatableTask,
  mandoPerson,
  mandoToday,
  retainerRunRate,
} from './founder'
import {
  atRiskProject,
  awaitingClients,
  clientById,
  monthRevenue,
  overdueInvoices,
  overdueTotal,
  tasksDueToday,
} from './insights'
import { nextBuildJob } from './cursorPrompt'
import { approveLevel3, formatEval, runImprovementCycle } from './engineer'

export type KernelAction = 'analyse' | 'priorities' | 'opportunities' | 'bottleneck' | 'learn' | 'sync' | 'build' | 'loop' | 'improve' | 'approve'

export type KernelReply = {
  agentId: AgentId
  intent: string
  text: string
  bullets?: string[]
  actions?: ProposedAction[]
  skillName?: string
}

function act(
  kind: ProposedAction['kind'],
  label: string,
  description: string,
  payload: Record<string, unknown> = {},
): ProposedAction {
  return { id: uid('act'), kind, label, description, payload, status: 'proposed' }
}

export const KERNEL_PROMPTS: Record<KernelAction, string> = {
  analyse: 'Analyse yourself',
  priorities: 'What should I prioritise?',
  opportunities: 'What opportunities do you see?',
  bottleneck: 'Where am I the bottleneck?',
  learn: 'Learn from the web',
  sync: 'Sync live sites',
  build: 'Build yourself',
  loop: 'Run loop now',
  improve: 'Run the self-improvement cycle',
  approve: 'Level 3 approved',
}

export function analyseSelf(state: BusinessState): KernelReply {
  const { findings, integrity } = analyze(state)
  const open = findings.filter((f) => f.status === 'open')
  const critical = open.filter((f) => f.severity === 'critical')
  const overdue = overdueTotal(state)
  const next = nextBuildJob(state)
  const name = state.company.assistantName
  const goal = goalProgress(state)
  return {
    agentId: 'ceo',
    intent: 'analyze-self',
    skillName: 'chief-of-staff',
    text: `${name} analysed the OS for you, not for herself. Integrity ${integrity}/100. Ultimate goal ${FOUNDER.ultimateGoal.label}: ${money(goal.collected)} / ${money(goal.amount)} (${goal.pct}%). ${
      critical.length
        ? `${critical.length} critical finding${critical.length === 1 ? '' : 's'} — cash or delivery before anything pretty.`
        : open.length
          ? `${open.length} open finding${open.length === 1 ? '' : 's'}. None are critical.`
          : 'No open wounds on this scan.'
    } Ledger ${state.invoices.length === 0 ? 'is empty — I will not invent overdue' : overdue > 0 ? `shows ${money(overdue)} overdue` : 'is current'}.`,
    bullets: [
      `R1m: ${goal.headline}`,
      ...open.slice(0, 4).map((f) => `${f.loop} · ${f.severity} · ${f.title}`),
      `Skills ${state.skills.length} · repairs ${state.repairedIds.length} · web notes ${state.knowledge.length}`,
      next.via === 'spoken' && /do not invent work/i.test(next.title)
        ? 'Next build: nothing open — I will not invent “Build Aria herself”.'
        : `Next build (${next.via}): ${next.title}`,
      `Autopilot ${state.autopilot ? 'on' : 'off'} · coding agent ${state.writeMode === 'branch' ? 'live (L2 branch)' : 'paused (L1)'}${state.level3Approved ? ' · L3 approved' : ''}${state.cursorReady ? ' · Cursor ready' : ''}`,
    ],
  }
}

export function prioritiesNow(state: BusinessState): KernelReply {
  const overdue = overdueTotal(state)
  const invoices = overdueInvoices(state)
  const today = tasksDueToday(state)
  const waiting = awaitingClients(state)
  const risk = atRiskProject(state)
  const riskClient = risk ? clientById(state, risk.clientId) : undefined
  const rev = monthRevenue(state)
  const retainers = retainerRunRate(state)
  const notices = (state.notices.length ? state.notices : detectNotices(state)).slice(0, 4)
  const goal = goalProgress(state)
  const p1 = overdue > 0
    ? `P1 Cash: ${money(overdue)} overdue across ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}. Collect before you invent.`
    : state.invoices.length === 0
      ? `P1 Cash: ledger empty — R0 of R1 million. Paidly homepage mock is not your books.`
      : 'P1 Cash: nothing overdue.'
  const p2 = today.length || waiting.length || risk
    ? `P2 Commitments: ${today.length} due today${waiting.length ? ` · ${waiting.length} awaiting feedback` : ''}${riskClient ? ` · ${riskClient.name} ${risk?.daysBehind}d behind` : ''}.`
    : 'P2 Commitments: board is quiet.'
  const p3 = `P3 Revenue → R1m: ${money(goal.collected)} collected (${goal.pct}%) · MTD ${money(rev)}${state.company.monthTarget ? ` / ${money(state.company.monthTarget)}` : ''} · retainers ${money(retainers)}/mo.`
  return {
    agentId: 'ceo',
    intent: 'priority',
    skillName: 'prioritisation',
    text: `Default stack: ${FOUNDER.defaultPriority.join(' → ')}. Scoreboard is ${FOUNDER.ultimateGoal.label} collected. I will not let you chase everything. Today that means cash and commitments beat Paidly surface area and new offers.`,
    bullets: [p1, p2, p3, `P4 Assets: BrandCafé + Paidly live · ${state.skills.length} skills.`, ...notices.map((n) => n.text.replace(/^Mando, I noticed /, ''))].slice(0, 6),
    actions: invoices.length ? [act('draft_reminders', 'Collect overdue cash', 'Priority 1. Drafts, then you send.')] : [],
  }
}

export function opportunitiesNow(state: BusinessState): KernelReply {
  const ops = detectOpportunities(state)
  const pursue = ops.filter((o) => o.verdict === 'pursue')
  const test = ops.filter((o) => o.verdict === 'test')
  const top = pursue[0] ?? test[0] ?? ops[0]
  return {
    agentId: 'ceo',
    intent: 'opportunity',
    skillName: 'opportunity-detection',
    text: top
      ? `${formatVerdict(top.verdict)} — ${top.title}. ${top.reason} ${pursue.length ? `${pursue.length} to pursue.` : 'Nothing is a pursue until cash and delivery allow it.'} I will not let a prettier idea jump this queue.`
      : 'No opportunities scored. Sync live sites or add real work — I will not invent a pipeline.',
    bullets: ops.slice(0, 6).map((o) => `${formatVerdict(o.verdict)} · ${o.title} · ${o.money} · test: ${o.test}`),
  }
}

export function bottleneckNow(state: BusinessState): KernelReply {
  const me = mandoPerson(state)
  const mine = mandoToday(state)
  const producer = mine.filter(isDelegatableTask)
  const overdue = overdueTotal(state)
  return {
    agentId: 'ceo',
    intent: 'ceo',
    skillName: 'delegation',
    text: `You are still the bottleneck where production sits on the founder. ${mine.length} item${mine.length === 1 ? '' : 's'} due today ${me ? `at ${me.load}% load` : 'on you'}. Designer → Creative Director → Business Owner → CEO. If a task repeats, I ask why Mando is still doing it.`,
    bullets: [
      overdue > 0 ? `Do not take new production while ${money(overdue)} is overdue.` : 'Cash is not the current choke — your time is.',
      ...mine.slice(0, 4).map((t) => `${t.title} · ${t.priority}${producer.some((p) => p.id === t.id) ? ' · delegate or systemise' : ''}`),
      producer.length
        ? `${producer.length} of those look like producer work. Systemise them.`
        : mine.length
          ? 'Keep strategy, clients, and Paidly decisions. Production is not your job.'
          : 'Nothing on your today-board — either the board is empty or work is already off you.',
    ],
    actions: mine.length
      ? [act('reassign', 'Pull production off Mando', 'Protect founder time. Producer owns chase and briefs.', { personIds: me ? [me.id] : [] })]
      : [],
  }
}

export function improveCycleNow(state: BusinessState): KernelReply {
  const report = state.reports?.[0]
  if (!report) {
    return {
      agentId: 'ceo',
      intent: 'improve',
      skillName: 'software-engineer',
      text: 'No improvement cycle has run yet. Tap Improve cycle.',
    }
  }
  const l2 = report.tickets.filter((t) => t.level === 2)
  const l3 = report.tickets.filter((t) => t.level === 3)
  return {
    agentId: 'ceo',
    intent: 'improve',
    skillName: 'software-engineer',
    text: `${report.summary} I am the coding agent. I implement on a branch. I do not merge.`,
    bullets: [
      ...formatEval(report.eval).slice(0, 4),
      report.vsPrev ? `Vs last eval: ${report.vsPrev}` : 'No prior eval to compare — I will not invent a lift.',
      ...report.tickets.slice(0, 4).map((t) => `L${t.level} · ${t.area} · ${t.problem}`),
      l2.length ? `${l2.length} could go to a branch if you say “build yourself” or turn Branch writes on.` : 'No Level 2 writes queued.',
      l3.length ? `${l3.length} need your approval (auth, payments, migrations, security).` : state.level3Approved ? 'Level 3 approved — branch only. You merge.' : 'No Level 3 items waiting.',
    ].slice(0, 8),
    actions: l2[0]
      ? [act('engineer_implement', 'Implement next on a branch', l2[0].improvement, { ticketId: l2[0].id, task: l2[0].improvement })]
      : l3[0] && !state.level3Approved
        ? [act('engineer_approve', 'Approve Level 3 (still no merge)', l3[0].problem, { ticketId: l3[0].id })]
        : [],
  }
}

export function applyKernel(state: BusinessState, action: KernelAction): { state: BusinessState; reply: KernelReply } {
  if (action === 'improve') {
    const evolved = evolve(state)
    const ran = runImprovementCycle(evolved)
    return { state: ran.state, reply: improveCycleNow(ran.state) }
  }
  if (action === 'analyse' || action === 'loop') {
    const next = evolve(state)
    return { state: next, reply: analyseSelf(next) }
  }
  if (action === 'opportunities') {
    const ops = detectOpportunities(state)
    const next = { ...state, opportunities: ops, notices: state.notices.length ? state.notices : detectNotices(state) }
    return { state: next, reply: opportunitiesNow(next) }
  }
  if (action === 'priorities') {
    const next = { ...state, notices: state.notices.length ? state.notices : detectNotices(state) }
    return { state: next, reply: prioritiesNow(next) }
  }
  if (action === 'bottleneck') {
    return { state, reply: bottleneckNow(state) }
  }
  if (action === 'approve') {
    const next = approveLevel3(state)
    return {
      state: next,
      reply: {
        agentId: 'ceo',
        intent: 'level3-approve',
        skillName: 'software-engineer',
        text: 'Level 3 is approved. I may implement auth, payments, migrations, or security on a branch. I still will not merge, deploy, delete data, or spend.',
        bullets: [
          'Allowed on a branch: auth, payments, migrations, security rules',
          'Still you: merge, production deploy, delete data, spend',
        ],
      },
    }
  }
  return { state, reply: analyseSelf(state) }
}
