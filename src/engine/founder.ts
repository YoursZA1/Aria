import type { BusinessState, Notice, Opportunity, Task } from '../types'
import { FOUNDER } from '../data/founder'
import { money } from '../lib/format'
import { collectedRevenue, goalProgress, servesGoal } from './goal'
import {
  atRiskProject,
  awaitingClients,
  clientById,
  monthRevenue,
  overdueInvoices,
  overdueTotal,
  personById,
  tasksDueToday,
} from './insights'

export function retainerRunRate(state: BusinessState): number {
  return state.clients.reduce((s, c) => s + c.retainer, 0)
}

export function mandoPerson(state: BusinessState) {
  return state.people.find((p) => /mando|armando/i.test(p.name)) ?? state.people[0]
}

export function mandoToday(state: BusinessState) {
  const me = mandoPerson(state)
  if (!me) return []
  return tasksDueToday(state).filter((t) => t.assigneeId === me.id)
}

/** Production or kickoff work the founder should not own day-to-day. */
const PRODUCTION_TITLE = /brief |call sheet|follow up|chase |revisions|moodboard|export|kickoff —/i

export function isDelegatableTask(task: Task): boolean {
  if (PRODUCTION_TITLE.test(task.title)) return true
  return task.priority === 'low'
}

export function detectNotices(state: BusinessState): Notice[] {
  const notices: Notice[] = []
  const overdue = overdueTotal(state)
  const invoices = overdueInvoices(state)
  const risk = atRiskProject(state)
  const riskClient = risk ? clientById(state, risk.clientId) : undefined
  const me = mandoPerson(state)
  const mine = mandoToday(state)
  const waiting = awaitingClients(state)
  const rev = monthRevenue(state)
  const gap = Math.max(0, (state.company.monthTarget || 0) - rev)
  const paidly = state.projects.find((p) => /paidly/i.test(p.name))
  const beta = state.projects.filter((p) => p.status !== 'live' && p.id.startsWith('live-'))

  if (!state.lastLiveSync) {
    notices.push({
      id: 'sync',
      priority: 1,
      href: '/systems',
      prompt: 'Sync live sites',
      text: 'Mando, I noticed I have not pulled brand-cafe.co.za and paidly.co.za yet. Until I do, I will not invent a studio.',
    })
  }

  if (overdue > 0) {
    notices.push({
      id: 'cash',
      priority: 1,
      href: '/finance',
      prompt: "Which clients haven't paid?",
      text: `Mando, I noticed ${money(overdue)} is overdue across ${invoices.length} clients${gap ? ` · ${money(gap)} off target` : ''}. Collect before you invent.`,
    })
  } else if (state.invoices.length === 0) {
    notices.push({
      id: 'no-ledger',
      priority: 2,
      href: '/finance',
      prompt: 'How do I get from R0 to R1 million?',
      text: 'Mando, I noticed the invoice ledger is empty — R0 of R1 million. The Paidly marketing site is not your books. First rand is a real BrandCafé invoice or a Paidly subscriber. I will not copy the demo dashboard (Highveld, Brightleaf).',
    })
  }

  const collected = collectedRevenue(state)
  if (collected > 0 && collected < FOUNDER.ultimateGoal.amount) {
    const g = goalProgress(state)
    notices.push({
      id: 'r1m',
      priority: 4,
      href: '/finance',
      prompt: 'How do I get from R0 to R1 million?',
      text: `Mando, I noticed ${money(collected)} collected toward R1 million (${g.pct}%). Next milestone ${money(g.next)}.`,
    })
  }

  if (risk && riskClient) {
    notices.push({
      id: 'commit',
      priority: 2,
      href: '/projects',
      prompt: 'What is blocking production?',
      text: `Mando, I noticed ${riskClient.name} / ${risk.name} is ${risk.daysBehind} day${risk.daysBehind === 1 ? '' : 's'} behind.`,
    })
  }

  const hotLead = state.leads.find((l) => ['proposal', 'negotiation'].includes(l.stage))
  if (hotLead) {
    notices.push({
      id: 'revenue',
      priority: 3,
      href: '/marketing',
      prompt: 'Show me the pipeline and campaigns.',
      text: `Mando, I noticed ${hotLead.company} (${money(hotLead.value)}) is in ${hotLead.stage}. ${hotLead.nextStep}`,
    })
  }

  if (waiting.length) {
    notices.push({
      id: 'blocked',
      priority: 2,
      href: '/clients',
      prompt: 'Which clients are awaiting feedback?',
      text: `Mando, I noticed ${waiting.map((c) => c.name).join(' and ')} are sitting on feedback.`,
    })
  }

  if (me && mine.length >= 3) {
    notices.push({
      id: 'bottleneck',
      priority: 2,
      href: '/work',
      prompt: 'Where am I the bottleneck?',
      text: `Mando, I noticed you still own ${mine.length} things due today. Why is the founder doing this?`,
    })
  }

  if (paidly && beta.length) {
    notices.push({
      id: 'products',
      priority: 5,
      href: '/projects',
      prompt: 'What opportunities do you see?',
      text: `Mando, I noticed Paidly is live while ${beta.map((p) => p.name).join(', ')} are not. Do not starve the live company for a new build.`,
    })
  }

  return notices.sort((a, b) => a.priority - b.priority).slice(0, 6)
}

export function detectOpportunities(state: BusinessState): Opportunity[] {
  const overdue = overdueTotal(state)
  const cashHot = overdue > 0
  const paidly = state.projects.find((p) => /paidly/i.test(p.name))
  const collected = collectedRevenue(state)
  const ops: Opportunity[] = []

  if (collected === 0) {
    ops.push({
      id: 'first-rand',
      title: 'First rand toward R1 million',
      whyNow: 'Scoreboard is R0. Nothing compounds until cash is real.',
      who: 'One BrandCafé buyer or one Paidly subscriber.',
      whyUs: 'You already have two live companies. You do not need a third.',
      money: 'R1 is the next milestone. R1,000,000 is the destination.',
      difficulty: 'med',
      test: 'One paid invoice or one paid Paidly plan this month. Connect the ledger. Do not start a new offer until that exists.',
      verdict: cashHot ? 'wait' : 'pursue',
      reason: cashHot ? 'WAIT — collect what is already owed first.' : 'PURSUE — first verified rand beats every new idea.',
    })
  }

  if (overdue > 0) {
    ops.push({
      id: 'collect-cash',
      title: 'Collect overdue cash',
      whyNow: `${money(overdue)} is already earned and late.`,
      who: overdueInvoices(state).map((i) => clientById(state, i.clientId)?.name ?? i.number).join(', '),
      whyUs: 'This is keeping money that is ours — not acquisition.',
      money: money(overdue),
      difficulty: 'low',
      test: 'Draft reminders. Do not start a new offer until they move.',
      verdict: 'pursue',
      reason: 'Priority 1 is cash.',
    })
  }

  ops.push({
    id: 'paidly',
    title: 'Grow Paidly — it is already live',
    whyNow: paidly ? paidly.brief : 'paidly.co.za is in market.',
    who: 'SA freelancers, agencies, SMEs who invoice.',
    whyUs: 'You built it. BrandCafé already lists it as Live.',
    money: 'Public plans: Starter / Business / Growth on paidly.co.za. MRR unknown until you connect the real ledger.',
    difficulty: 'med',
    test: 'One activation metric this month. Kill features that fail revenue, retention, value, efficiency, advantage.',
    verdict: cashHot ? 'wait' : 'pursue',
      reason: cashHot ? 'WAIT — collect cash first.' : 'PURSUE — this is Level 4 and the compounding engine for R1 million. Do not treat it as a side tab.',
  })

  const event = state.projects.find((p) => /event/i.test(p.name))
  if (event) {
    ops.push({
      id: 'event-platform',
      title: 'Event Platform (beta)',
      whyNow: event.brief,
      who: 'Event operators who already need ticketing + analytics.',
      whyUs: 'Already on the BrandCafé product list.',
      money: 'Unknown. Beta is not revenue.',
      difficulty: 'high',
      test: 'One paying event, or park it.',
      verdict: 'wait',
      reason: 'WAIT — Paidly is live. A second SaaS only after Paidly has a metric.',
    })
  }

  ops.push({
    id: 'no-fifth',
    title: 'Do not start another product',
    whyNow: 'Trading Intelligence and Fasting App are listed In Development on brand-cafe.co.za.',
    who: 'Nobody yet.',
    whyUs: 'Labs is allowed. A fifth company is not.',
    money: 'Zero until Paidly compounds.',
    difficulty: 'high',
    test: 'Keep them in Labs. No new brand, no new domain.',
    verdict: 'reject',
    reason: 'REJECT as companies. Labs experiments only.',
  })

  return ops
}

export function judgeIdea(text: string, state: BusinessState): {
  verdict: Opportunity['verdict']
  title: string
  reason: string
  numbers: string
  risks: string
  next: string
} {
  const t = text.toLowerCase()
  const overdue = overdueTotal(state)
  const cashHot = overdue > 0
  const risk = atRiskProject(state)
  const me = mandoPerson(state)
  const liveProducts = state.projects.filter((p) => p.id.startsWith('live-')).map((p) => p.name).join(', ') || 'Paidly + BrandCafé'

  if (/hire|recruit|employee|headcount/.test(t)) {
    return {
      verdict: cashHot ? 'wait' : 'test',
      title: 'Hiring',
      reason: cashHot ? 'Late invoices first.' : 'A contractor test is cleaner than a salary until Paidly MRR is real.',
      numbers: `${money(overdue)} overdue · you at ${me?.load ?? 0}% load.`,
      risks: 'A salary you cannot cover is bad debt.',
      next: 'Write the role as production, not another founder.',
    }
  }

  if (/ads|advertis|meta spend|boost|campaign budget/.test(t)) {
    return {
      verdict: 'wait',
      title: 'New ad spend',
      reason: 'No live campaign performance in the ledger. Do not buy ads on a story.',
      numbers: `${money(overdue)} overdue. Public CTAs are already live on both sites.`,
      risks: 'Vanity spend while Paidly metrics are unknown.',
      next: 'Connect real Paidly numbers, then decide.',
    }
  }

  if (/new (saas|app|product|agency|studio)|another (saas|product)|start a/.test(t)) {
    return {
      verdict: 'reject',
      title: 'A new company / product',
      reason: `You already have ${liveProducts}. A new front is how founders stay busy and poor. It does not move R0 → R1 million — it resets the clock.`,
      numbers: `Collected toward R1m: ${money(collectedRevenue(state))}. MTD ${money(monthRevenue(state))} (ledger).`,
      risks: 'Opportunity cost is Paidly.',
      next: 'Improve Paidly. Labs can prototype. Do not name a new brand. Scoreboard is R0 → R1 million collected.',
    }
  }

  if (/raise price|increase rate|put (my|our) prices/.test(t)) {
    return {
      verdict: 'test',
      title: 'Raise prices',
      reason: 'Paidly public plans are on the site. Consulting rates are not — set them from valued growth, not hours.',
      numbers: retainerRunRate(state) ? `Retainers ${money(retainerRunRate(state))}/mo.` : 'No retainers in the ledger yet.',
      risks: 'Do not raise on late-paying clients.',
      next: 'New consulting proposals go up. Paidly plan changes need churn math.',
    }
  }

  if (/paidly/.test(t) && /feature|build|add/.test(t)) {
    return {
      verdict: 'wait',
      title: 'Paidly feature',
      reason: FOUNDER.ventures.find((v) => v.id === 'paidly' && 'test' in v)?.test ?? 'Revenue, retention, value, efficiency, advantage — or no.',
      numbers: `If it does not move collected cash toward R1 million, it is consumption.`,
      risks: 'Building comfort features instead of distribution.',
      next: cashHot || risk ? 'Cash and delivery first.' : 'Name the metric. If you cannot, we do not build it.',
    }
  }

  if (cashHot || risk) {
    return {
      verdict: 'wait',
      title: 'This idea',
      reason: 'Cash or delivery is on fire.',
      numbers: `${money(overdue)} overdue${risk ? ` · ${clientById(state, risk.clientId)?.name} ${risk.daysBehind}d behind` : ''}.`,
      risks: 'Opportunity cost is the live companies.',
      next: 'Park it. Today: cash, then Paidly.',
    }
  }

  return {
    verdict: servesGoal(text) ? 'test' : 'wait',
    title: 'This idea',
    reason: servesGoal(text)
      ? 'Not obviously stupid — and not obviously worth a company. It might move collected cash toward R1 million. Test it small.'
      : 'This does not obviously collect, retain, or compound cash toward R1 million. WAIT unless you can name the rand it produces.',
    numbers: `R1m scoreboard ${money(collectedRevenue(state))} · MTD ${money(monthRevenue(state))} · you at ${me?.load ?? 0}%.`,
    risks: 'If this needs you every week, it is a job, not an asset. Jobs do not compound to R1m.',
    next: 'Smallest test that can fail in 7 days. If it cannot collect or retain cash, park it.',
  }
}

export function formatVerdict(v: Opportunity['verdict']): string {
  return v.toUpperCase()
}

export function ownerOf(taskAssigneeId: string, state: BusinessState): string {
  return personById(state, taskAssigneeId)?.name.split(' ')[0] ?? 'someone'
}
