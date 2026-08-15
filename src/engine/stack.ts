import type { AgentId, BusinessState } from '../types'
import { money } from '../lib/format'
import { monthRevenue, overdueTotal, overloadedPeople, tasksDueToday } from './insights'
import { retainerRunRate } from './founder'

type StackResult = {
  agentId: AgentId
  text: string
  bullets?: string[]
  intent: string
  skillName?: string
}

function frame(skillName: string, agentId: AgentId, text: string, bullets?: string[]): StackResult {
  return { agentId, intent: 'cursor-skill', skillName, text, bullets }
}

export function isStackAsk(t: string): string | null {
  if (/ceo brief|daily brief|weekly (report|performance)|monthly (report|financial|growth)|quarterly (review|report)|business performance report|strategic review/.test(t)) return 'ceo-reporting'
  if (/client (intel|profit|portfolio)|which clients (to |should )|capacity.*client|upsell potential|fire (a |this )?client|client health/.test(t)) return 'client-intelligence'
  if (/decision journal|log (this )?decision|record (this )?decision|how (do )?i (usually )?decide|lessons learned/.test(t)) return 'decision-journal'
  if (/should i hire|when to hire|contractor vs|employee cost|job spec|role design|skills gap|team structure/.test(t)) return 'hiring-intelligence'
  if (/does mando need to|take off my plate|stop doing everything|automate then delegate|outsource or eliminate/.test(t)) return 'delegation'
  if (/sop\b|process map|wasting time|wasting money|workflow|quality control|team capacity|where (are we|is the) (slow|stuck)/.test(t)) return 'business-operations'
  if (/where should we spend (our )?marketing|marketing effort|what should we (post|advertise)|seo (and|or) content/.test(t)) return 'marketing-intelligence'
  if (/lead score|score (this|the) (lead|company)|qualify (this )?(company|lead)|decision maker/.test(t)) return 'lead-intelligence'
  if (/trend ≠ opportunity|is this a trend|everyone is doing|what.?s the trend/.test(t)) return 'trend-detection'
  if (/design must solve|creative brief|brand positioning|design system|not a moodboard/.test(t)) return 'creative-strategy'
  if (/people → companies|knowledge (graph|architecture|management)|where (is|do we keep)/.test(t)) return 'knowledge-management'
  if (/\b(llm|rag|embeddings|vector db|mcp|agent architecture|tool calling)\b/.test(t)) return 'ai-technology'
  if (/\b(react|next\.js|supabase|postgres|vercel|what (are )?developers)\b/.test(t) && !/\.(ts|tsx|js)\b/.test(t)) return 'software-development-awareness'
  if (/\b(src\/|plugins\/|how does .{0,40}(file|function|component)|explain .{0,40}code|typeerror|fix .{0,40}\.(ts|tsx))\b/.test(t)) return 'code-engineering'
  if (/urgent vs important|too many ideas|15 ideas|busywork|high value vs/.test(t)) return 'prioritisation'
  if (/how (should|do) you (speak|talk|communicate)|communication protocol|tone of voice|be (less )?(agreeable|chirpy)/.test(t)) return 'communication-protocol'
  return null
}

export function stackBrief(skillName: string, state: BusinessState, text: string): StackResult {
  if (skillName === 'ceo-reporting') return reportBrief(state, text)
  if (skillName === 'client-intelligence') return clientIntelBrief(state)
  if (skillName === 'hiring-intelligence') return hireBrief(state)
  if (skillName === 'delegation' || skillName === 'business-operations') return opsBrief(state, skillName)
  if (skillName === 'decision-journal') return journalBrief(state)
  if (skillName === 'communication-protocol') return protocolBrief()
  return frame(skillName, 'ceo', `Applying “${skillName}”. I’ll retrieve what we have, calculate what we can, and I will not invent your books.`)
}

function protocolBrief(): StackResult {
  return frame('communication-protocol', 'ceo', 'I speak as your executive assistant. Concise, intelligent, professional, direct, calm, analytical, proactive. No filler. Useful before agreeable.', [
    'Complex asks: Assessment → Analysis → Recommendation → Risk → Next Action.',
    'Decisions: PURSUE / TEST / WAIT / REJECT.',
    'Labels: Observation / Opportunity / Risk / Action Required / Automation Opportunity / Information Required.',
    'Confidence: Confirmed / Likely / Assumption / Unknown / Needs Research.',
    'Priority: P0 threat → P1 revenue/client/strategy → P2 improvement → P3 optimisation → P4 backlog.',
  ])
}

function reportBrief(state: BusinessState, text: string): StackResult {
  const t = text.toLowerCase()
  const horizon = /quarter/.test(t) ? 'Quarterly strategic review' : /month/.test(t) ? 'Monthly financial + growth' : /week/.test(t) ? 'Weekly performance' : 'Daily CEO brief'
  const overdue = overdueTotal(state)
  const retainers = retainerRunRate(state)
  const today = tasksDueToday(state)
  return frame('ceo-reporting', 'ceo', `${horizon}. Priority is cash, then commitments, then growth. Ledger ${state.invoices.length === 0 ? 'empty — R0. I will not invent numbers' : `shows ${money(monthRevenue(state))} paid this month`}.`, [
    overdue > 0 ? `Finance: ${money(overdue)} overdue — P0/P1.` : 'Finance: nothing overdue, or no invoices on file.',
    today.length ? `Projects: ${today.length} due today.` : 'Projects: board empty until you add real work.',
    retainers > 0 ? `Business: retainers ${money(retainers)}/mo.` : 'Business: no retainers in the OS yet.',
    'Recommended Actions: collect cash, deliver commitments, then Paidly. A third company is P4.',
  ])
}

function clientIntelBrief(state: BusinessState): StackResult {
  const real = state.clients.filter((c) => c.id !== 'live-self' && !c.id.startsWith('live-'))
  const live = state.clients.filter((c) => c.id.startsWith('live-') && c.id !== 'live-self')
  if (!real.length) {
    return frame('client-intelligence', 'client', 'No operating client ledger. Live-site names are not books. I will not invent a R15k vs R10k comparison until Paidly login or you add real retainers.', [
      live.length ? `On the public sites: ${live.map((c) => c.name).join(', ')}.` : 'No organisations parsed from live sites.',
      'Score needs revenue, capacity consumed, relationship, growth, risk.',
    ])
  }
  const totalCap = state.people.reduce((s, p) => s + p.capacity, 0) || 1
  const lines = real.slice(0, 6).map((c) => {
    const load = state.projects.filter((p) => p.clientId === c.id).length
    const share = Math.round((load / Math.max(1, state.projects.length)) * 100)
    return `${c.name}: ${money(c.retainer)}/mo · health ${c.health} · ~${share || 0}% of named projects · ${c.status}`
  })
  return frame('client-intelligence', 'client', 'Client mix from the OS — capacity is a project count proxy until time-tracking exists.', [
    ...lines,
    `Team capacity on file: ${overloadedPeople(state).length ? 'overloaded' : `${state.people.length} people · ${totalCap}h`}.`,
  ])
}

function hireBrief(state: BusinessState): StackResult {
  const mando = state.people.find((p) => /mando|armando/i.test(p.name))
  const load = mando ? `${mando.load}/${mando.capacity}` : 'unknown'
  return frame('hiring-intelligence', 'ceo', `Hire to remove you as the bottleneck — not to look like a company. Your load on file: ${load}. Books ${state.invoices.length ? 'exist' : 'are empty, so I will not pretend you can fund a salary'}.`, [
    'Contractor test before employee.',
    'Role = repeating work you must stop.',
    'Cash and retainers first.',
  ])
}

function opsBrief(state: BusinessState, skillName: string): StackResult {
  const overloaded = overloadedPeople(state)
  const risk = state.projects.filter((p) => p.daysBehind > 0 || p.bottleneck)
  return frame(skillName, 'project', 'Does Mando need to do this? If not: automate → delegate → outsource → eliminate.', [
    overloaded.length ? `Bottleneck: ${overloaded.map((p) => p.name).join(', ')} over capacity.` : 'Capacity file is thin — assume you are the bottleneck.',
    risk.length ? `Delivery drag: ${risk.map((p) => p.name).join(', ')}.` : 'No late projects on file.',
    `${tasksDueToday(state).length} due today · find the repeating ones and take them off you.`,
  ])
}

function journalBrief(state: BusinessState): StackResult {
  const last = state.decisions[0]
  return frame('decision-journal', 'ceo', last
    ? `Last filed: ${last.decision} (${last.date}). Recommendation: ${last.recommendation || '—'}. Actual outcome still ${last.actualOutcome ? 'logged' : 'empty — tell me what happened'}.`
    : 'Decision journal is empty. Important calls get Decision, Date, Context, Options, Recommendation, Decision Made, Expected Outcome, Actual Outcome, Lessons Learned.', [
    `${state.decisions.length} rows on file.`,
    'I will not invent how you decided.',
  ])
}

