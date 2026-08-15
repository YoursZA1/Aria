import type { AgentId, BusinessState, ChatMessage, CursorJob, ProposedAction } from '../types'
import { AGENTS } from '../data/seed'
import { money, nextFriday, uid, weekdayName } from '../lib/format'
import {
  atRiskProject,
  awaitingClients,
  clientById,
  dashboardInsights,
  monthRevenue,
  overdueInvoices,
  overdueTotal,
  overloadedPeople,
  personById,
  productionProjects,
  silentClients,
  tasksDueToday,
} from './insights'
import { FOUNDER } from '../data/founder'
import { followUpDraft, proposalDraft, reminderDrafts, rescheduleDraft } from './actions'
import { matchSkill, matchWiredSkill } from './kernel'
import {
  detectNotices,
  formatVerdict,
  judgeIdea,
  retainerRunRate,
} from './founder'
import { cursorBusy } from './cursor'
import { isCursorBuild, isCursorControl, isEmptyBuild, jobFromTask, nextBuildJob, parseAutopilotToggle, spokenDraft, wantsCancel } from './cursorPrompt'
import { isStackAsk, stackBrief } from './stack'
import { isCodeAsk, wantsCodeChange } from './code'
import { isGoalAsk, isUnpaidAsk, isWealthAsk } from './query'
import { goalProgress } from './goal'
import { formatEval, gateTask, isEngineerAsk, parseLevel3Approval, parseWriteMode } from './engineer'
import { foldAsk } from '../lib/fold'
import { isAcknowledgment } from '../lib/ack'
import { analyseSelf, bottleneckNow, opportunitiesNow, prioritiesNow } from './kernelActions'

export type BrainResult = {
  agentId: AgentId
  text: string
  bullets?: string[]
  actions?: ProposedAction[]
  intent: string
  buildNote?: string
  researchQuery?: string
  researchUrl?: string
  shipText?: string
  cursorJob?: CursorJob
  cancelCursor?: boolean
  autopilot?: boolean
  writeMode?: import('../types').EngineerWriteMode
  level3Approved?: boolean
  skillName?: string
}

function pickAgent(text: string, selected: AgentId | 'auto'): AgentId {
  if (selected !== 'auto') return selected
  const t = text.toLowerCase()
  if (/\bpaidly\b|saas|mrr|churn/.test(t)) return 'ceo'
  if (/brand\s*caf[eé]|brandcafe/.test(t)) return 'ceo'
  if (/should i |hire |invest |spend |delegat/.test(t)) return 'ceo'
  if (/invoice|overdue|revenue|cash|profit|outstanding|money|target|\bpaid\b/.test(t)) return 'finance'
  if (/client|feedback|follow.?up|relationship|health/.test(t)) return 'client'
  if (/project|deadline|production|bottleneck|task|team|overload|assign/.test(t)) return 'project'
  if (/lead|campaign|content|social|pipeline|proposal|marketing/.test(t)) return 'marketing'
  if (/brief|brand|moodboard|copy|design|creative|voice/.test(t)) return 'creative'
  return 'ceo'
}

function act(
  kind: ProposedAction['kind'],
  label: string,
  description: string,
  payload: Record<string, unknown> = {},
  secondaryLabel?: string,
): ProposedAction {
  return { id: uid('act'), kind, label, secondaryLabel, description, payload, status: 'proposed' }
}

export function think(raw: string, state: BusinessState): BrainResult {
  const text = foldAsk(raw)
  const t = text.toLowerCase()
  const agentId = pickAgent(text, state.selectedAgent)
  const name = state.company.assistantName
  const last = [...state.messages].reverse().find((m) => m.role === 'assistant')

  if (/^(what('?s| is) your name|who are you|what do i call you)\b/.test(t)) {
    return {
      agentId: 'ceo',
      intent: 'hello',
      text: `I’m ${name}. I work for you first, Mando — not the other way around. Call me ${name}. I read BrandCafé and Paidly live. I do not invent a studio.`,
    }
  }

  if (isVoiceCheck(t)) return voiceCheckBrief(state, name)
  if (isAriaPing(t, name)) return ariaPingBrief(name)

  if (/^(hi|hello|hey|help)\b/.test(t) || t === '' || t === name.toLowerCase()) {
    return {
      agentId: agentId === 'ceo' ? 'ceo' : agentId,
      intent: 'hello',
      text: `I’m ${name}. Yes, Mando — profile is loaded. ${AGENTS.find((a) => a.id === agentId)?.greeting} I will not tell you what you want to hear.`,
      bullets: [
        '“Show me everything I need to deal with today.”',
        '“What should I prioritise?”',
        '“Build yourself.”',
        '“Work on Paidly.”',
        '“Improve the BrandCafé site.”',
        '“Autopilot off.” / “Autopilot on.”',
        '“Explain how brain.ts works.”',
        '“Fix the type error in kernel.ts.”',
        '“Where am I the bottleneck?”',
      ],
    }
  }

  if (/ignore|dismiss|not now|skip (it|this)/.test(t)) {
    return {
      agentId,
      intent: 'ignore',
      text: 'Left it. I’ll keep watching cash, delivery, and the two live sites.',
      actions: last?.actions?.map((a) => ({ ...a, status: 'dismissed' as const })),
    }
  }

  if (isAcknowledgment(t)) return ackBrief(state, last)

  if (isCodeAsk(t) && !wantsCodeChange(t) && !isCursorBuild(t) && !isCursorControl(t)) {
    return {
      agentId: 'ceo',
      intent: 'code',
      skillName: 'code-engineering',
      text: 'Give me a second — I’m reading this repo, not guessing.',
      bullets: ['Retrieve first', 'Cite real files'],
    }
  }
  if (isEngineer(t)) return engineerBrief(state, t)
  if (isCursorControl(t) || isCursorBuild(t) || (isCodeAsk(t) && wantsCodeChange(t))) return cursorLoop(state, text, t)
  if (isUnpaid(t)) return unpaid(state)
  if (isGoal(t)) return goalBrief(state)
  if (isWealth(t)) return wealthBrief(state, t)
  if (isKnowledge(t)) return knowledgeBrief(state)
  if (isLearn(t)) return researchIntent(text)
  if (isLiveSync(t)) return liveSyncIntent()
  if (isFounder(t)) return founderBrief(state)
  if (isSkillsList(t)) return skillsList(state)
  if (isOutOfScope(t)) return outOfScopeBrief(name)
  if (isSelf(t)) return selfReport(state, t)
  if (isRoadmap(t)) return showRoadmap(state)
  if (isBuild(t)) return buildNote(state, text)
  if (isReminders(t, last)) return reminders(state)
  const stack = isStackAsk(t)
  if (stack) return stackBrief(stack, state, text)
  if (isToday(t)) return todayBrief(state)
  if (isPriority(t)) return priorityBrief(state)

  const wired = matchWiredSkill(text, state.skills)
  if (wired) {
    return {
      agentId: wired.agentId,
      intent: 'cursor-skill',
      skillName: wired.name,
      text: `Give me a second — I’m applying “${wired.name}”, the same skill Cursor uses. I will not invent your books.`,
      bullets: [`Skill: ${wired.name}`, 'Same skills as Cursor'],
    }
  }

  if (isPaidly(t)) return paidlyBrief(state, t)
  if (isBrandCafe(t)) return brandCafeBrief(state)
  if (isDecide(t)) return decideBrief(state, text)
  if (isOpportunity(t)) return opportunityBrief(state)
  if (isCeo(t)) return ceoBrief(state)
  if (isHandle(t, last)) return handleAlert(state)
  if (isFollow(t)) return followups(state)
  if (isProjects(t)) return projects(state)
  if (isTeam(t)) return team(state)
  if (isRevenue(t)) return revenue(state)
  if (isLeads(t)) return leads(state)
  if (isCreative(t)) return creative(state, t)
  if (isMarketing(t)) return marketing(state)
  if (isProposal(t)) return proposal(state)
  if (/approve|send (all|them|it)|yes,? (please|do|send)/.test(t) && last?.actions?.some((a) => a.kind === 'send_emails' || a.kind === 'draft_reminders')) {
    return reminders(state)
  }

  const skill = matchSkill(text, state.skills)
  if (skill) {
    return {
      agentId: skill.agentId,
      intent: 'skill',
      text: skill.reply,
      bullets: [`Skill: ${skill.name}`, `Grown by ${skill.source === 'web' ? 'the web' : skill.source === 'self' ? 'Aria' : 'you'} · used ${skill.uses + 1}×`],
    }
  }

  return {
    agentId,
    intent: 'fallback',
    text: `I don’t have that in the OS yet. I’ll investigate — match a Cursor skill if I have one, otherwise go on the web.`,
    researchQuery: text,
    bullets: dashboardInsights(state).slice(0, 4).map((i) => `${i.area}: ${i.value}`),
  }
}

function isKnowledge(t: string) {
  return /what did you learn|your knowledge|web (notes|learning)|show (me )?(what you|your) (learned|knowledge)|browser log/.test(t)
}
function isLearn(t: string) {
  return /learn about|research |look up |browse |search the web|go online|read this (url|page|link)|https?:\/\//.test(t)
}
function isLiveSync(t: string) {
  return /sync (live )?sites|pull (the )?(live )?(sites|pages)|refresh (live|paidly|brand)|read (the )?(two )?live sites/.test(t)
}
function isFounder(t: string) {
  return /who am i|about me|my (profile|vision|ambition|north star)|what do you know about me|founder intelligence|armando mavelele/.test(t)
}
function isPaidly(t: string) {
  return /\bpaidly\b/.test(t)
}
function isBrandCafe(t: string) {
  return /brand\s*caf[eé]|brandcafe/.test(t)
}
function isDecide(t: string) {
  if (/remind|invoice|meridian|proposal|haven'?t paid/.test(t)) return false
  if (isGoal(t) || isWealth(t)) return false
  return /should i |is this (a )?(good|bad)|evaluate (this|the)|hire |spend |invest |borrow |buy |purchase |launch /.test(t)
}
function isOpportunity(t: string) {
  return /what opportunit|opportunit(y|ies) do you|detect opportunit|what should i (pursue|build next)|product opportunity|look for opportunit/.test(t)
}
function isCeo(t: string) {
  return /where am i the bottleneck|delegat|outsource|systemise|systemize|why (am i|is mando) still|become (a )?ceo|stop doing everything|designer to ceo|mando still doing/.test(t)
}
function isPriority(t: string) {
  return /what should i (focus|priorit|do first|work on)|priority stack|my priorities|too many ideas|don't let me chase/.test(t)
}
function isEngineer(t: string) {
  return isEngineerAsk(t)
}
function isGoal(t: string) {
  return isGoalAsk(t)
}
function isWealth(t: string) {
  return isWealthAsk(t)
}
function isToday(t: string) {
  if (isStackAsk(t) || isWealth(t) || isUnpaid(t) || isGoal(t)) return false
  return /today|need(s)? (my )?attention|deal with|briefing|status (update|report)|good morning/.test(t)
}
function isUnpaid(t: string) {
  return isUnpaidAsk(t)
}
function isSkillsList(t: string) {
  return /list (your )?(current )?skills|what skills|show (me )?(your )?(current )?skills|skills do you have|your skill stack|cursor skills/.test(t)
}
function isOutOfScope(t: string) {
  if (/weather|temperature|forecast|will it rain|how hot|how cold/.test(t)) return true
  if (/\b(gdp|inflation|exchange rate|cricket score|football score|lottery|horoscope)\b/.test(t) && !/\b(paidly|brand|client|invoice|cash|revenue|retainer|mrr|profit|margin)\b/.test(t)) return true
  return false
}
function isReminders(t: string, last?: ChatMessage) {
  return /send reminder|remind them|chase payment|nudge them|draft reminder/.test(t)
    || ((/send (them|it|those)|do it|go ahead/.test(t)) && last?.intent === 'unpaid')
    || ((/send/.test(t)) && (last?.intent === 'unpaid' || last?.intent === 'reminders'))
}
function isHandle(t: string, last?: ChatMessage) {
  return /handle (it|the delay|meridian)|move (the )?photography|reschedule/.test(t)
    || (/handle it|do that|go ahead/.test(t) && (last?.intent === 'today' || last?.intent === 'projects'))
}
function isFollow(t: string) {
  return /follow.?up|hasn'?t responded|awaiting feedback|waiting on/.test(t)
}
function isProjects(t: string) {
  return /project|production|bottleneck|behind schedule|deadline/.test(t)
}
function isTeam(t: string) {
  return /overload|capacity|who'?s busy|team load/.test(t)
}
function isRevenue(t: string) {
  return /revenue|profit|cash flow|this month|kpi|target/.test(t)
}
function isLeads(t: string) {
  if (isWealth(t) || isUnpaid(t) || isGoal(t)) return false
  return /\bleads?\b|opportunit|\bpipeline\b/.test(t)
}
function isCreative(t: string) {
  return /brief|brand guideline|moodboard|copy|design direction|creative/.test(t)
}
function isMarketing(t: string) {
  return /campaign|content calendar|social post|competitor/.test(t)
}
function isProposal(t: string) {
  return /proposal/.test(t)
}
function isRoadmap(t: string) {
  return /what('?s| is) on the (roadmap|build)|show (me )?(the )?(roadmap|build list|build notes)|build notes/.test(t)
}
function isBuild(t: string) {
  if (/\b(invoice|haven'?t paid|meridian delay|send reminder|yourself|diagnose|integrity)\b/.test(t)) return false
  return /\b(roadmap|feature request|help (you|it) build|remember this)\b/.test(t)
    || /^(add a feature|add an? (page|widget|button|section|agent|voice|tool)|i want you to (add|build|make)|we should (add|build)|can you add |build a |ship a )/.test(t)
}
function isSelf(t: string) {
  if (isCursorBuild(t) || isCursorControl(t) || isSkillsList(t) || isCodeAsk(t) || isEngineer(t)) return false
  return /yourself|self[- ]?(repair|analy|build|scan|diagnos)|how (healthy|are) you|your (integrity|kernel)|repair yourself|fix yourself|evolve|grow yourself|scan yourself|analyse yourself|analyze yourself/.test(t)
}

function isVoiceCheck(t: string) {
  return /can you hear me|do you hear me|are you (there|listening|awake)|mic check|testing (one|1|two|2)|voice check|you there/.test(t)
}

function isAriaPing(t: string, name: string) {
  return new RegExp(`^(?:${name}|arya|area|ari)[,.!?\\s]*$`, 'i').test(t.trim())
}

function voiceCheckBrief(state: BusinessState, name: string): BrainResult {
  const overdue = overdueTotal(state)
  const today = tasksDueToday(state)
  return {
    agentId: 'ceo',
    intent: 'voice-check',
    text: `Yes, Mando — I hear you. I’m ${name}. Speak naturally. Say “stop” if you want me quiet.`,
    bullets: [
      overdue > 0 ? `Cash: ${money(overdue)} overdue — Priority 1.` : 'Cash: ledger clear or empty.',
      today.length ? `Commitments: ${today.length} due today.` : 'Commitments: nothing due today.',
      `Assets: BrandCafé and Paidly live · integrity ${state.integrity}.`,
    ],
  }
}

function ariaPingBrief(name: string): BrainResult {
  return {
    agentId: 'ceo',
    intent: 'hello',
    text: `Yes, Mando? I’m ${name}.`,
    bullets: [
      '“Show me everything I need to deal with today.”',
      '“What should I prioritise?”',
      '“Build yourself.”',
    ],
  }
}

function ackBrief(state: BusinessState, last?: ChatMessage): BrainResult {
  const overdue = overdueTotal(state)
  const overdueList = overdueInvoices(state)
  const today = tasksDueToday(state)
  const risk = atRiskProject(state)
  const riskClient = risk ? clientById(state, risk.clientId) : undefined
  const retainers = retainerRunRate(state)

  let lead = 'Roger, Mando.'
  if (last?.intent === 'unpaid' || last?.intent === 'reminders') {
    lead = overdue > 0 ? 'Roger — cash stays Priority 1.' : 'Roger — ledger is clear.'
  } else if (last?.intent === 'handle' || last?.intent === 'projects' || last?.intent === 'today') {
    lead = risk && riskClient
      ? `Roger — ${riskClient.name} delay is still the delivery risk.`
      : 'Roger — commitments look steady.'
  } else if (last?.intent === 'priority' || last?.intent === 'decide' || last?.intent === 'paidly') {
    lead = 'Roger — stack unchanged: cash → commitments → revenue → assets.'
  }

  return {
    agentId: 'ceo',
    intent: 'ack',
    text: `${lead} Here’s the live read:`,
    bullets: [
      overdue > 0
        ? `Cash: ${money(overdue)} overdue across ${overdueList.length} invoice(s).`
        : state.invoices.length === 0
          ? 'Cash: ledger empty — Paidly homepage mock is not your books.'
          : 'Cash: nothing overdue.',
      today.length
        ? `Commitments: ${today.length} due today${risk && riskClient ? ` · ${riskClient.name} ${risk.daysBehind}d behind on ${risk.name}` : ''}.`
        : risk && riskClient
          ? `Commitments: ${riskClient.name} / ${risk.name} ${risk.daysBehind}d behind.`
          : 'Commitments: nothing due today.',
      `Assets: BrandCafé and Paidly live · retainers ${money(retainers)}/mo · integrity ${state.integrity}.`,
    ],
  }
}

function skillsList(state: BusinessState): BrainResult {
  const cursor = state.skills.filter((s) => s.source === 'cursor')
  const self = state.skills.filter((s) => s.source === 'self')
  const mando = state.skills.filter((s) => s.source === 'mando')
  const web = state.skills.filter((s) => s.source === 'web')
  const groups = [
    cursor.length ? `Cursor (${cursor.length}): ${cursor.map((s) => s.name).join(', ')}` : '',
    self.length ? `Grown by Aria (${self.length}): ${self.map((s) => s.name).join(', ')}` : '',
    mando.length ? `From your notes (${mando.length}): ${mando.map((s) => s.name).join(', ')}` : '',
    web.length ? `From the web (${web.length}): ${web.map((s) => s.name).join(', ')}` : '',
  ].filter(Boolean)
  return {
    agentId: 'ceo',
    intent: 'skills-list',
    text: cursor.length
      ? `${state.skills.length} skills wired — same stack as Cursor in this workspace. Cash, commitments, and assets first; I route deep work through chief-of-staff, business-analysis, financial-decision-making, and the rest.`
      : `${state.skills.length} skills in memory. Cursor catalog still loading — restart dev if this stays at zero.`,
    bullets: groups.length
      ? groups
      : [
        'chief-of-staff',
        'business-analysis',
        'financial-decision-making',
        'strategic-thinking',
        'opportunity-detection',
        'ceo-decision-support',
        'prioritisation',
        'business-operations',
        'ceo-reporting',
        'agency-management',
        'creative-strategy',
        'client-intelligence',
        'sales-growth',
        'web-research',
        'saas-product-strategy',
      ],
  }
}

function outOfScopeBrief(name: string): BrainResult {
  return {
    agentId: 'ceo',
    intent: 'out-of-scope',
    text: `That’s outside my lane, Mando. I’m ${name}, your holographic COO — cash, commitments, revenue, and assets for BrandCafé and Paidly. Not weather, trivia, or macro stats.`,
    bullets: [
      '“Which clients haven’t paid?”',
      '“What should I prioritise today?”',
      '“List your current skills.”',
      '“Work on Paidly.”',
    ],
  }
}

function cursorLoop(state: BusinessState, text: string, t: string): BrainResult {
  const write = parseWriteMode(t)
  if (write) {
    return {
      agentId: 'ceo',
      intent: 'write-mode',
      writeMode: write,
      skillName: 'software-engineer',
      text:
        write === 'branch'
          ? 'Coding agent mode on. I implement on aria/improve-* branches, then stop for a PR. I still do not merge, deploy, or touch payments.'
          : 'Coding agent writes paused. I will analyse and ticket (Level 1). Say “build yourself” for one job, or turn Branch writes back on.',
    }
  }
  const toggle = parseAutopilotToggle(t)
  if (toggle === false) {
    return {
      agentId: 'ceo',
      intent: 'autopilot-off',
      autopilot: false,
      cancelCursor: cursorBusy(state),
      text: 'Autopilot off. The nightly improvement cycle also pauses. Say “run the self-improvement cycle” when you want a report without me picking jobs.',
    }
  }
  if (toggle === true) {
    return {
      agentId: 'ceo',
      intent: 'autopilot-on',
      autopilot: true,
      text:
        state.writeMode === 'branch'
          ? 'Autopilot on. I am the coding agent: branch, implement, test, PR. I do not merge.'
          : 'Autopilot on at Level 1 — analyse and ticket. Turn Branch writes on if you want me to implement.',
    }
  }
  if (wantsCancel(t)) {
    return {
      agentId: 'ceo',
      intent: 'cursor-cancel',
      cancelCursor: true,
      text: cursorBusy(state)
        ? `Stopping Cursor on “${state.cursorRun?.title}”.`
        : 'Nothing is running in Cursor. Autopilot is still yours to toggle on the Aria page.',
    }
  }
  if (cursorBusy(state)) {
    return {
      agentId: 'ceo',
      intent: 'cursor-busy',
      text: `I’m already in Cursor building “${state.cursorRun?.title}”. Say “stop” to kill it, or wait until I’m back.`,
      bullets: [state.cursorRun?.liveText?.slice(-200) || 'Working…'],
    }
  }
  const draft = isCodeAsk(t) ? spokenDraft(text, state) : /yourself|aria/.test(t) ? nextBuildJob(state, 'chat') : spokenDraft(text, state)
  const gate = gateTask(draft.task, {
    writeMode: state.writeMode ?? 'branch',
    source: 'chat',
    approvedIds: state.approvedTicketIds,
    level3Approved: state.level3Approved,
  })
  if (!gate.ok) {
    return {
      agentId: 'ceo',
      intent: 'engineer-gate',
      skillName: 'software-engineer',
      text: gate.reason,
      bullets: [`Classified Level ${gate.level}`, 'Coding agent: Aria · Types via Cursor · Merge: Mando'],
    }
  }
  if (isEmptyBuild(draft)) {
    return {
      agentId: 'ceo',
      intent: 'build',
      text: 'Nothing open to recover. I will not invent a production rewrite. Ask for the improvement cycle, or name a real file.',
    }
  }
  const job = jobFromTask(state, draft.task, draft.source, draft.title, draft.roadmapId)
  const origin =
    draft.via === 'roadmap' || draft.roadmapId
      ? 'your roadmap'
      : draft.via === 'finding'
        ? 'an open kernel finding'
        : draft.via === 'miss'
          ? 'a miss I need to recover'
          : 'this ask'
  return {
    agentId: 'ceo',
    intent: 'cursor-build',
    skillName: 'software-engineer',
    cursorJob: job,
    text: `Level 2 from ${origin}: ${draft.title}. I am the coding agent — I retrieve, then Cursor types the patch on a branch. You merge. Stop me on this page.`,
    bullets: [draft.task.slice(0, 180), `Target: ${job.product}`, 'No merge · no deploy · no .env'],
  }
}

function engineerBrief(state: BusinessState, t: string): BrainResult {
  if (parseLevel3Approval(t)) {
    const waiting = (state.tickets ?? []).filter(
      (x) => x.level === 3 && x.status !== 'merged' && x.status !== 'rejected' && x.status !== 'rolled_back',
    )
    return {
      agentId: 'ceo',
      intent: 'level3-approve',
      level3Approved: true,
      skillName: 'software-engineer',
      text: `Level 3 is approved. I may implement auth, payments, migrations, or security on an aria/improve-* branch. I still will not merge, deploy, delete data, or spend. ${waiting.length ? `${waiting.length} ticket${waiting.length === 1 ? '' : 's'} moved to planned.` : 'No Level 3 tickets were waiting — the flag is on for the next one.'}`,
      bullets: [
        'Allowed on a branch: auth, payments, migrations, security rules',
        'Still you: merge, production deploy, delete data, spend',
        state.writeMode === 'branch' ? 'Coding agent writes are on' : 'Turn Branch writes on if you want me to implement',
      ],
    }
  }
  if (/run |cycle now|improve yourself|self-improv/.test(t) && /cycle|report|now|loop|improv/.test(t)) {
    return {
      agentId: 'ceo',
      intent: 'improve-run',
      skillName: 'software-engineer',
      text: 'Give me a second — running the self-improvement cycle. I will not invent scores.',
    }
  }
  const report = state.reports?.[0]
  const evalNow = report?.eval
  return {
    agentId: 'ceo',
    intent: 'engineer',
    skillName: 'software-engineer',
    text: `I am the coding agent. Level 1 I analyse. Level 2 I implement on a branch and open a PR. Level 3 is you: merge, deploy, auth, payments, data, security, spend. Write mode is ${state.writeMode === 'branch' ? 'on (I code)' : 'off (observe only)'}.`,
    bullets: [
      evalNow ? `Last eval ${new Date(evalNow.at).toLocaleString('en-ZA')} · vs prior: ${report?.vsPrev ?? 'none'}` : 'No eval yet — say “run the self-improvement cycle”. I will not invent 92%.',
      ...(evalNow ? formatEval(evalNow).slice(0, 4) : []),
      `Open tickets: ${(state.tickets ?? []).filter((x) => x.status === 'proposed' || x.status === 'needs_approval').length}`,
      'GitHub is the source of truth. Log: docs/AI_IMPROVEMENT_LOG.md',
    ],
  }
}

function liveSyncIntent(): BrainResult {
  return {
    agentId: 'ceo',
    intent: 'live-sync',
    text: 'Give me a second — pulling brand-cafe.co.za and paidly.co.za. I will not invent a studio while I wait.',
  }
}

function researchIntent(text: string): BrainResult {
  const url = text.match(/https?:\/\/[^\s]+/)?.[0]
  const q = text
    .replace(/https?:\/\/[^\s]+/g, ' ')
    .replace(/^(aria,?\s*)?(please\s*)?(learn about|research|look up|browse|search the web( for)?|go online( and| to)?|read this (url|page|link))\s*/i, '')
    .trim() || (url ? url.replace(/^https?:\/\//, '') : text)
  return {
    agentId: 'ceo',
    intent: 'research',
    text: `Give me a second — I’m on the web for “${q}”. I’ll keep only what helps your cash, delivery, or assets.`,
    researchQuery: q,
    researchUrl: url,
  }
}

function knowledgeBrief(state: BusinessState): BrainResult {
  if (!state.knowledge.length) {
    return {
      agentId: 'ceo',
      intent: 'knowledge',
      text: 'Nothing from the web yet. Say “learn about …” or paste a URL. On boot I also pull one curriculum topic for your stack — retainers, Paidly economics, productising BrandCafé.',
    }
  }
  return {
    agentId: 'ceo',
    intent: 'knowledge',
    text: `${state.knowledge.length} pages kept. Last browse ${state.lastBrowse ? new Date(state.lastBrowse).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—'}. I do not hoard articles — I keep takeaways.`,
    bullets: state.knowledge.slice(0, 6).map((k) => `${k.title} — ${k.takeaway}`),
  }
}

function selfReport(state: BusinessState, t: string): BrainResult {
  const looping = /repair|fix|evolve|grow|scan/.test(t)
  const base = analyseSelf(state)
  if (!looping) return base
  return {
    ...base,
    intent: /repair|fix/.test(t) ? 'repair-self' : 'evolve-self',
    text: `${state.company.assistantName} kernel ran for you, not for herself. Integrity from this scan is in the bullets. I analyse BrandCafé and Paidly against your priority stack, repair what’s safe, and grow skills that make you more money and less busy.`,
  }
}

function buildNote(state: BusinessState, text: string): BrainResult {
  const note = text
    .replace(/^(remember this[:\s]*|add a feature[:\s]*|i want you to\s+|we should\s+|can you add\s+|build a\s+|ship a\s+)/i, '')
    .trim() || text
  return {
    agentId: 'ceo',
    intent: 'build',
    buildNote: note,
    text: state.autopilot
      ? `Got it. Filed on the build list — Autopilot is on, so I’ll take this into Cursor as one bounded task. Kill switch is on my kernel page.`
      : `Got it. Filed on the build list. Turn Autopilot on, or tap Ship in Cursor, if you want me to write the code.`,
    bullets: [note, ...state.roadmap.map((r) => r.text)].slice(0, 6),
    actions: state.autopilot
      ? undefined
      : [act('cursor_build', 'Ship in Cursor', 'Start one bounded Cursor run for this note.', { note })],
  }
}

function showRoadmap(state: BusinessState): BrainResult {
  if (!state.roadmap.length) {
    return {
      agentId: 'ceo',
      intent: 'roadmap',
      text: 'The build list is empty. Tap Live, then tell me what to add — a page, a widget, a connection, a behaviour.',
    }
  }
  return {
    agentId: 'ceo',
    intent: 'roadmap',
    text: `${state.roadmap.length} notes on the build list. Keep talking — I’ll keep stacking them.`,
    bullets: state.roadmap.map((r) => r.text),
  }
}

function founderBrief(state: BusinessState): BrainResult {
  const retainers = retainerRunRate(state)
  const goal = goalProgress(state)
  return {
    agentId: 'ceo',
    intent: 'founder',
    text: `${FOUNDER.fullName}. I have the profile loaded and I work it. Scoreboard: ${FOUNDER.ultimateGoal.label} collected — not valuation theatre. You are not trying to stay a designer — you are building a creative and technology ecosystem that employs 20+ people and compounds into wealth. I will challenge you when a shiny idea attacks that.`,
    bullets: [
      `Ultimate goal: ${goal.headline}`,
      `North star: ${FOUNDER.northStar}`,
      `Philosophy: ${FOUNDER.philosophy}`,
      `Ventures: ${FOUNDER.ventures.map((v) => v.name).join(' · ')}`,
      `Money path: ${FOUNDER.wealthPath.join(' → ')}`,
      `Default priority: ${FOUNDER.defaultPriority.join(' → ')}`,
      `Retainers in flight: ${money(retainers)}/mo — Level 3. Paidly is Level 4 and it waits if cash is late.`,
      `How I speak: ${FOUNDER.communicate}. I will not agree just because you suggested it.`,
    ],
  }
}

function goalBrief(state: BusinessState): BrainResult {
  const goal = goalProgress(state)
  return {
    agentId: 'finance',
    intent: 'goal',
    skillName: 'financial-decision-making',
    text: `${FOUNDER.ultimateGoal.label}. ${goal.headline} ${FOUNDER.ultimateGoal.definition} Recommendation: first paying client or Paidly subscriber, then retainers, then Paidly MRR. A third company resets the clock.`,
    bullets: [
      `Metric: ${goal.metric} · ${money(goal.collected)} / ${money(goal.amount)} (${goal.pct}%)`,
      `Next milestone: ${money(goal.next)} · gap ${money(goal.nextGap)}`,
      goal.overdue > 0 ? `Fastest increment: collect ${money(goal.overdue)} overdue.` : 'Nothing overdue in this OS — connect Paidly if cash lives there.',
      ...goal.path.slice(0, 4),
    ],
  }
}

function paidlyBrief(state: BusinessState, t: string): BrainResult {
  const overdue = overdueTotal(state)
  const risk = atRiskProject(state)
  const blocked = overdue > 0 || !!risk
  const paidlyTask = state.tasks.find((x) => /paidly/i.test(x.title))
  const pricing = state.campaigns.find((c) => /paidly/i.test(c.name))?.performance
  if (/feature|build|add|should we/.test(t)) {
    const j = judgeIdea(t, state)
    return {
      agentId: 'ceo',
      intent: 'paidly',
      text: `${formatVerdict(j.verdict)} — Paidly. ${j.reason}`,
      bullets: [
        `Test: ${FOUNDER.ventures.find((v) => v.id === 'paidly' && 'test' in v)?.test ?? 'Revenue, retention, value, efficiency, advantage — or no.'}`,
        `Numbers: ${j.numbers}`,
        `Risks: ${j.risks}`,
        `Next: ${j.next}`,
      ],
    }
  }
  return {
    agentId: 'ceo',
    intent: 'paidly',
    text: blocked
      ? `WAIT on new Paidly surface area. Cash or delivery is on fire — a feature will not collect ${money(overdue)}.`
      : `Paidly is live at ${state.company.paidlyUrl}. Treat it as a company: pricing, activation, retention, unit economics. ${paidlyTask ? `Board: ${paidlyTask.title}.` : 'Pick one metric this month.'}`,
    bullets: [
      'Does this feature increase revenue, retention, customer value, efficiency or strategic advantage?',
      pricing ? `Public pricing: ${pricing}` : 'Pricing is on paidly.co.za — Starter / Business / Growth.',
      blocked ? `Cash first: ${money(overdue)} overdue${risk ? ` · ${clientById(state, risk.clientId)?.name} ${risk.daysBehind}d behind` : ''}.` : 'Ledger is empty or current — a protected Paidly block is allowed, not an all-night rebuild.',
      'Do not start a second SaaS. Homepage mock invoices (Highveld, Brightleaf) are marketing, not your books.',
    ],
  }
}

function brandCafeBrief(state: BusinessState): BrainResult {
  const orgs = state.clients.filter((c) => c.id !== 'live-self')
  const products = state.projects.filter((p) => p.id.startsWith('live-'))
  return {
    agentId: 'ceo',
    intent: 'brandcafe',
    text: `BrandCafé is live at ${state.company.brandCafeUrl}. ${state.company.tagline} I pulled ${orgs.length} organisations and ${products.length} products off the public site — not a made-up agency roster.`,
    bullets: [
      ...products.map((p) => `${p.name} · ${p.status} · ${p.brief}`),
      orgs.length ? `Named on the site: ${orgs.map((c) => c.name).join(', ')}.` : 'No organisations parsed yet — sync the site.',
      'Path: expertise → systems → products → assets. Paidly is already the product.',
    ],
  }
}

function decideBrief(state: BusinessState, text: string): BrainResult {
  const j = judgeIdea(text, state)
  return {
    agentId: 'ceo',
    intent: 'decide',
    skillName: /hire|recruit|employee/.test(text.toLowerCase()) ? 'hiring-intelligence' : 'ceo-decision-support',
    text: `${formatVerdict(j.verdict)} — ${j.title}. ${j.reason} Does this move you closer to long-term objectives?`,
    bullets: [
      `Recommendation: ${formatVerdict(j.verdict)}`,
      `Why: ${j.reason}`,
      `Expected upside: ${j.numbers}`,
      `Risks: ${j.risks}`,
      `Cost: unknown until books or a quote — I will not invent one.`,
      `Opportunity cost: cash and commitments first; Paidly before a new front.`,
      `Next step: ${j.next}`,
    ],
  }
}

function opportunityBrief(state: BusinessState): BrainResult {
  return opportunitiesNow(state)
}

function ceoBrief(state: BusinessState): BrainResult {
  return bottleneckNow(state)
}

function priorityBrief(state: BusinessState): BrainResult {
  return prioritiesNow(state)
}

function wealthLevel(state: BusinessState): { level: number; headline: string; detail: string } {
  const retainers = retainerRunRate(state)
  const paidlyLive = !!state.company.paidlyUrl
  const agencyWork = state.clients.length > 0 || monthRevenue(state) > 0 || state.projects.length > 0
  if (retainers > 0 && paidlyLive) {
    return {
      level: 4,
      headline: `Level 4 — ${FOUNDER.moneyProgression[3]}`,
      detail: `Retainers ${money(retainers)}/mo (Level 3) plus Paidly live. Cash and delivery before new product surface area.`,
    }
  }
  if (retainers > 0) {
    return {
      level: 3,
      headline: `Level 3 — ${FOUNDER.moneyProgression[2]}`,
      detail: `${money(retainers)}/mo recurring in the ledger.`,
    }
  }
  if (agencyWork) {
    return {
      level: 2,
      headline: `Level 2 — ${FOUNDER.moneyProgression[1]}`,
      detail: 'Client and project revenue without retainers locked in yet.',
    }
  }
  return {
    level: 1,
    headline: `Level 1 — ${FOUNDER.moneyProgression[0]}`,
    detail: 'Ledger is empty — sync Paidly or add real invoices; I will not use marketing mock numbers.',
  }
}

function wealthBrief(state: BusinessState, t: string): BrainResult {
  const current = wealthLevel(state)
  const specific = t.match(/\blevel\s*([1-6])\b/)?.[1]
  const asked = specific ? Number(specific) : current.level
  const label = FOUNDER.moneyProgression[asked - 1] ?? FOUNDER.moneyProgression[current.level - 1]
  const lead = specific
    ? `Level ${asked}: ${label}.${asked === current.level ? ` That is where you are now — ${current.detail}` : asked < current.level ? ' You have moved past this.' : ` Not there yet — ${current.headline}. ${current.detail}`}`
    : `${current.headline}. ${current.detail}`
  return {
    agentId: 'finance',
    intent: 'wealth',
    text: `${lead} Scoreboard: ${FOUNDER.ultimateGoal.label} collected. Long arc: ${FOUNDER.wealthPath.join(' → ')}. Recurring, margin, IP, equity — not more hours.`,
    bullets: [
      goalProgress(state).headline,
      ...FOUNDER.moneyProgression.map((level, i) => `Level ${i + 1}: ${level}${i === 2 ? ` · now ${money(retainerRunRate(state))}/mo` : ''}${i === 3 ? ' · Paidly live' : ''}${i + 1 === current.level ? ' · you are here' : ''}`),
      `North star: ${FOUNDER.northStar}`,
    ],
  }
}

function todayBrief(state: BusinessState): BrainResult {
  const today = tasksDueToday(state)
  const overdue = overdueInvoices(state)
  const risk = atRiskProject(state)
  const riskClient = risk ? clientById(state, risk.clientId) : undefined
  const friday = nextFriday()
  const waiting = awaitingClients(state)
  const overloaded = overloadedPeople(state)
  const notices = (state.notices.length ? state.notices : detectNotices(state)).slice(0, 3)
  const actions: ProposedAction[] = []
  if (risk && riskClient) {
    actions.push(
      act('reschedule', 'Handle it', `Move the ${risk.name} review to ${weekdayName(friday)} and draft the client note.`, { projectId: risk.id, clientId: risk.clientId, newDate: friday }, 'View project'),
    )
  }
  if (overdue.length) {
    actions.push(act('draft_reminders', 'Draft payment reminders', `${overdue.length} overdue invoices · ${money(overdueTotal(state))}.`))
  }
  if (waiting.length) {
    actions.push(act('follow_up', 'Chase quiet clients', waiting.map((c) => c.name).join(', ')))
  }

  return {
    agentId: 'ceo',
    intent: 'today',
    text: `Cash, then commitments, then revenue. Not a dump of the board — the work that protects you.`,
    bullets: [
      ...notices.map((n) => n.text),
      today.length
        ? `${today.length} tasks due today: ${today.map((t) => t.title).join(' · ')}.`
        : 'No tasks due today. The board is empty until you add real work.',
      overdue.length
        ? `${overdue.length} invoices overdue · ${money(overdueTotal(state))}.`
        : state.invoices.length === 0
          ? 'Invoice ledger is empty. Paidly’s homepage mock is not your books.'
          : 'Nothing overdue.',
      waiting.length
        ? `${waiting.length} clients blocking us: ${waiting.map((c) => c.name).join(', ')}.`
        : 'No clients awaiting feedback.',
      risk && riskClient
        ? `${riskClient.name} / ${risk.name} is ${risk.daysBehind} days behind.`
        : 'No delivery risks flagged.',
      overloaded.length
        ? `${overloaded.map((p) => p.name.split(' ')[0]).join(' and ')} are over capacity.`
        : 'Capacity is fine — it is just you until you hire.',
    ],
    actions,
  }
}

function unpaid(state: BusinessState): BrainResult {
  const list = overdueInvoices(state)
  const total = overdueTotal(state)
  if (!list.length) {
    return {
      agentId: 'finance',
      intent: 'unpaid',
      text: state.invoices.length === 0
        ? 'The ledger is empty. I will not invent overdue invoices from the Paidly homepage mock (Highveld, Brightleaf, Table Bay). Log into Paidly for real receivables.'
        : 'Nothing overdue. Outstanding invoices are still inside terms.',
    }
  }
  const lines = list.map((inv) => {
    const c = clientById(state, inv.clientId)
    return `${c?.name} — ${inv.number} · ${money(inv.amount)} · due ${inv.due}`
  })
  return {
    agentId: 'finance',
    intent: 'unpaid',
    text: `${list.length} clients have overdue invoices totalling ${money(total)}. That is Priority 1 — earned cash, not new work. I can prepare reminders in your voice. They do not send until you approve.`,
    bullets: lines,
    actions: [
      act('draft_reminders', 'Send reminders', 'I’ll draft the emails. You approve, then they go to the outbox.'),
    ],
  }
}

function reminders(state: BusinessState): BrainResult {
  const drafts = reminderDrafts(state)
  if (!drafts.length) {
    return { agentId: 'finance', intent: 'reminders', text: 'Nothing overdue to chase. Outstanding invoices are still inside terms — or the ledger is empty.' }
  }
  return {
    agentId: 'finance',
    intent: 'reminders',
    text: `I prepared ${drafts.length} payment reminders. They are not sent yet — approve below and I’ll put them in the outbox.`,
    bullets: drafts.map((d) => `${d.toName} · ${d.subject}`),
    actions: [
      act('send_emails', `Send all ${drafts.length}`, 'Marks invoices as reminded and files the emails in Sent.', { emails: drafts }),
    ],
  }
}

function handleAlert(state: BusinessState): BrainResult {
  const risk = atRiskProject(state)
  if (!risk) {
    return { agentId: 'project', intent: 'handle', text: 'No delayed projects to replan right now.' }
  }
  const client = clientById(state, risk.clientId)
  const friday = nextFriday()
  const email = client ? rescheduleDraft(state, client.id, weekdayName(friday)) : null
  return {
    agentId: 'project',
    intent: 'handle',
    text: `${client?.name ?? risk.name} is ${risk.daysBehind} days behind${risk.bottleneck ? ` — ${risk.bottleneck}` : ''}. I’ll move the review to ${weekdayName(friday)}${client?.contact ? ` and prepare a note for ${client.contact}` : ''}.`,
    bullets: [
      `Move ${risk.name} review → ${weekdayName(friday)}`,
      email ? `Email ready for ${email.toName}.` : 'No client email on file — calendar move only.',
    ].filter(Boolean),
    actions: [
      act(
        'reschedule',
        'Confirm reschedule + send note',
        `Moves the review${client?.contact ? ` and queues the email to ${client.contact}` : ''}.`,
        { eventId: '', newDate: friday, email, projectId: risk.id, clientId: client?.id },
      ),
    ],
  }
}

function followups(state: BusinessState): BrainResult {
  const waiting = awaitingClients(state)
  const silent = silentClients(state).filter((c) => c.id !== 'live-self' && !waiting.includes(c))
  const target = [...waiting, ...silent].find((c) => c.email)
  const email = target ? followUpDraft(state, target.id) : null
  if (!waiting.length && !silent.length) {
    return {
      agentId: 'client',
      intent: 'followup',
      text: 'No one is awaiting feedback. Names on brand-cafe.co.za are portfolio, not a chase list, unless you add real last-contact and email.',
    }
  }
  return {
    agentId: 'client',
    intent: 'followup',
    text: `${waiting.length} waiting on feedback${silent.length ? `, ${silent.length} quiet` : ''}.${target ? ` I’d send ${target.name} first.` : ' None of them have an email on file.'}`,
    bullets: [
      ...waiting.map((c) => `${c.name} · last contact ${c.lastContact} · ${c.notes}`),
      ...silent.map((c) => `${c.name} quiet since ${c.lastContact}`),
    ],
    actions: email
      ? [act('send_emails', `Send ${target?.name} follow-up`, 'Short bump, your voice.', { emails: [email] })]
      : waiting.length || silent.length
        ? [act('follow_up', 'Draft follow-ups', 'Anyone with an email on file.')]
        : [],
  }
}

function projects(state: BusinessState): BrainResult {
  const prod = productionProjects(state)
  const risk = atRiskProject(state)
  const friday = nextFriday()
  if (!state.projects.length) {
    return {
      agentId: 'project',
      intent: 'projects',
      text: 'No projects on the board yet. Sync the live sites and I’ll pull Paidly, Event Platform, Trading Intelligence, and Fasting App from brand-cafe.co.za — only if the page names them.',
      actions: [],
    }
  }
  return {
    agentId: 'project',
    intent: 'projects',
    text: `${prod.length} in production. ${risk ? `${clientById(state, risk.clientId)?.name ?? risk.name} is the risk — ${risk.daysBehind}d behind.` : 'No delivery risk flagged.'}`,
    bullets: state.projects.map((p) => {
      const c = clientById(state, p.clientId)
      const owner = personById(state, p.ownerId)
      return `${p.name}${c ? ` · ${c.name}` : ''} · ${p.status}${p.daysBehind ? ` · ${p.daysBehind}d behind` : ''}${owner ? ` · ${owner.name.split(' ')[0]}` : ''}`
    }),
    actions: risk
      ? [act('reschedule', 'Handle the delay', `Move the review to ${weekdayName(friday)}.`, { projectId: risk.id, clientId: risk.clientId, newDate: friday }), act('view_project', 'View project', '', { projectId: risk.id })]
      : [],
  }
}

function team(state: BusinessState): BrainResult {
  const overloaded = overloadedPeople(state)
  return {
    agentId: 'project',
    intent: 'team',
    text: overloaded.length
      ? `${overloaded.map((p) => p.name).join(' and ')} are over capacity. Do not add more production today.`
      : state.people.length <= 1
        ? 'It is you. Capacity is a founder problem, not a bench problem. Do not invent Aisha.'
        : 'Capacity looks healthy.',
    bullets: state.people.map((p) => `${p.name} · ${p.role} · ${p.load}% · ${p.focus}`),
    actions: overloaded.length
      ? [act('reassign', 'Defer low-priority work', 'Protect founder time. Move low-priority items off today.', { personIds: overloaded.map((p) => p.id) })]
      : [],
  }
}

function revenue(state: BusinessState): BrainResult {
  const rev = monthRevenue(state)
  const target = state.company.monthTarget
  const pct = target ? Math.round((rev / target) * 100) : 0
  const overdue = overdueTotal(state)
  const goal = goalProgress(state)
  return {
    agentId: 'finance',
    intent: 'revenue',
    text: target
      ? `Month to date ${money(rev)} against ${money(target)} (${pct}%). Ultimate goal ${FOUNDER.ultimateGoal.label}: ${money(goal.collected)} collected (${goal.pct}%). Overdue ${money(overdue)} is the fastest close — that is an asset already earned, not a new pitch. Retainers ${money(retainerRunRate(state))}/mo is Level 3. Do not confuse activity with progress.`
      : `Ledger is empty — ${money(rev)} MTD. Ultimate goal ${FOUNDER.ultimateGoal.label} is ${money(0)} of ${money(goal.amount)} until Paidly login or a real invoice. I will not invent R48,500. Retainers ${money(retainerRunRate(state))}/mo.`,
    bullets: [
      `R1m scoreboard: ${money(goal.collected)} / ${money(goal.amount)} (${goal.pct}%)`,
      `Paid this month: ${money(state.invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0))}`,
      `Retainers in flight: ${money(state.clients.reduce((s, c) => s + c.retainer, 0))}/mo`,
      `Overdue: ${money(overdue)} across ${overdueInvoices(state).length} invoices`,
      `Open pipeline: ${money(state.leads.filter((l) => !['won', 'lost'].includes(l.stage)).reduce((s, l) => s + l.value, 0))}`,
    ],
    actions: overdue > 0
      ? [act('draft_reminders', 'Collect overdue cash', 'Draft reminders for open invoices.')]
      : [],
  }
}

function leads(state: BusinessState): BrainResult {
  const active = state.leads.filter((l) => !['won', 'lost'].includes(l.stage))
  if (!active.length) {
    return {
      agentId: 'marketing',
      intent: 'leads',
      text: 'Pipeline is empty. I will not invent Veld Electric. BrandCafé’s live CTA is a consultation — that is the growth move until you add a real lead.',
      bullets: state.campaigns.map((c) => `${c.name} · ${c.performance}`),
    }
  }
  const top = [...active].sort((a, b) => b.value - a.value)[0]
  return {
    agentId: 'marketing',
    intent: 'leads',
    text: `${active.length} active opportunities, ${money(active.reduce((s, l) => s + l.value, 0))} in the pipe. ${top.company} is the one that should leave the building first.`,
    bullets: active.map((l) => `${l.company} · ${money(l.value)} · ${l.stage} · ${l.nextStep}`),
    actions: [act('draft_proposal', `Send ${top.company} proposal`, `${money(top.value)}. Draft in your voice.`, { leadId: top.id })],
  }
}

function proposal(state: BusinessState): BrainResult {
  const email = proposalDraft(state)
  if (!email) {
    return {
      agentId: 'marketing',
      intent: 'proposal',
      text: 'No open lead to propose to. Pipeline is empty — I will not invent a prospect or a R42k website.',
    }
  }
  const lead = state.leads.find((l) => l.id === email.relatedId)
  return {
    agentId: 'marketing',
    intent: 'proposal',
    text: `Proposal is ready for ${email.toName}${lead ? ` · ${lead.company}` : ''}. I’ll put it in your voice and wait for a send.`,
    bullets: [email.subject, lead ? money(lead.value) : '', `To: ${email.toName} <${email.to}>`].filter(Boolean),
    actions: [act('send_emails', 'Send proposal', 'Files the email in Sent and marks the lead as proposal-sent.', { emails: [email], leadId: email.relatedId })],
  }
}

function creative(state: BusinessState, t: string): BrainResult {
  const brand = state.brands.find((b) => {
    const c = clientById(state, b.clientId)
    return (c && t.includes(c.name.toLowerCase())) || t.includes(b.voice.toLowerCase().slice(0, 12))
  }) ?? (/paidly/.test(t) ? state.brands.find((b) => /paidly/i.test(b.voice)) : undefined) ?? state.brands[0]
  const client = brand ? clientById(state, brand.clientId) : undefined
  const project = brand
    ? (/paidly/.test(t)
      ? state.projects.find((p) => /paidly/i.test(p.name))
      : state.projects.find((p) => p.clientId === brand.clientId))
    : undefined
  if (!brand) {
    return {
      agentId: 'creative',
      intent: 'creative',
      text: 'No brand kit on file yet. Sync the live sites and I’ll pull BrandCafé and Paidly voice from the pages.',
    }
  }
  return {
    agentId: 'creative',
    intent: 'creative',
    text: `${/paidly/.test(t) ? 'Paidly' : client?.name ?? 'The brand'} — I have voice, colour, type, and the live brief. Use this as the guardrail, not a moodboard dump.`,
    bullets: [
      `Voice: ${brand.voice}`,
      `Colour: ${brand.colors.join(' · ')}`,
      `Type: ${brand.typefaces.join(' + ')}`,
      `Direction: ${brand.direction}`,
      project ? `Brief: ${project.brief}` : '',
    ].filter(Boolean),
  }
}

function marketing(state: BusinessState): BrainResult {
  if (!state.campaigns.length) {
    return {
      agentId: 'marketing',
      intent: 'marketing',
      text: 'No campaigns on file. Sync Paidly and BrandCafé and I’ll pull the live CTAs — get started free, book a consultation, affiliates.',
    }
  }
  return {
    agentId: 'marketing',
    intent: 'marketing',
    text: 'These are the live public campaigns, not a fictional teaser calendar.',
    bullets: state.campaigns.map((c) => `${c.name} · ${c.channel} · ${c.status} · ${c.performance}`),
  }
}

export function openingMessage(state: BusinessState): ChatMessage {
  const risk = atRiskProject(state)
  const client = risk ? clientById(state, risk.clientId) : undefined
  return {
    id: uid('msg'),
    role: 'assistant',
    agentId: 'ceo',
    intent: 'hello',
    text: `I’m ${state.company.assistantName}. Coding agent and COO — BrandCafé and Paidly, live. I retrieve this repo, then implement on a branch. You merge. Cash first. Autopilot writes unless you stop me on the kernel page. Right now: ${tasksDueToday(state).length} due today, ${state.invoices.length === 0 ? 'empty ledger' : `${overdueInvoices(state).length} overdue`}, ${client ? `${client.name} at risk` : 'no delivery risks'}.`,
    createdAt: new Date().toISOString(),
  }
}
