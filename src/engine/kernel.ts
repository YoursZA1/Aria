import type { AgentId, BusinessState, Finding, Skill } from '../types'
import { nextMonday, todayISO, uid, weekdayName } from '../lib/format'
import { FOUNDER_SKILLS } from '../data/founder'
import { detectNotices, detectOpportunities, isDelegatableTask, mandoPerson, mandoToday } from './founder'
import { overdueInvoices, overloadedPeople, silentClients } from './insights'
import { maybeNightlyImprove } from './engineer'
import { collectedRevenue } from './goal'
import { reminderDrafts } from './actions'
import { isAcknowledgment } from '../lib/ack'
import { foldAsk, isGoalAsk, isUnpaidAsk, isWealthAsk } from './query'

const STOP = new Set(['the', 'a', 'an', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'with', 'your', 'you', 'me', 'i', 'it', 'this', 'that', 'add', 'feature', 'please', 'aria', 'hey'])

/** Skill title grown from a chat miss — must stay in sync with growSkills(). */
export function recoverySkillName(miss: string): string {
  return `Recovered: ${miss.slice(0, 40)}`
}

/** Merge persisted misses with user lines that still ended in a fallback reply. */
export function collectMisses(state: BusinessState): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isAcknowledgment(trimmed)) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(trimmed)
  }
  for (const miss of state.misses) add(miss)
  const msgs = state.messages
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (m.role !== 'assistant' || m.intent !== 'fallback') continue
    for (let j = i - 1; j >= 0; j--) {
      if (msgs[j].role === 'user') {
        add(msgs[j].text)
        break
      }
    }
  }
  return out.slice(0, 12)
}

function hasRecovery(state: BusinessState, miss: string): boolean {
  return state.skills.some((s) => s.name === recoverySkillName(miss))
}

function recoveryReply(miss: string): string {
  const t = foldAsk(miss).toLowerCase()
  if (isGoalAsk(t)) {
    return 'Ask “how do I get from R0 to R1 million?” — I score verified collected cash, not valuation. Empty ledger is R0. First rand is a BrandCafé invoice or a Paidly subscriber.'
  }
  if (isWealthAsk(t)) {
    return 'Ask “level” or “what’s my level” — I map you to the six-level wealth path (income → retainers → Paidly → assets). Scoreboard is R0 → R1 million collected. I will not confuse it with trivia or GDP.'
  }
  if (/weather|temperature|forecast|will it rain/.test(t)) {
    return 'Weather is outside my lane. I’m your COO for BrandCafé and Paidly — cash, commitments, revenue, assets. Ask “what needs my attention today?”'
  }
  if (/\bgdp\b|inflation|cricket score|horoscope/.test(t) && !/paidly|brand|client|invoice|cash|revenue/.test(t)) {
    return 'Macro trivia and church GDP are not my job. I work Mando’s cash, commitments, and assets — try “which clients haven’t paid?” or “what should I prioritise?”'
  }
  if (/multitask|parallel|at once|simultaneous|background/.test(t)) {
    return 'Autopilot runs one bounded Cursor job while you talk. Kernel page: Autopilot on/off. Say “work on Paidly”, “build yourself”, or “ship this” to steer — cash and commitments first.'
  }
  if (isUnpaidAsk(t) || /cash|invoice|overdue|outstanding|who owes/.test(t)) {
    return `On “${miss}”: ask “which clients haven’t paid?” — I read your invoice ledger, not Paidly homepage marketing numbers.`
  }
  if (/commitment|due today|attention|briefing|priorit/.test(t)) {
    return `On “${miss}”: ask “what needs my attention today” or “what should I prioritise” — cash, then delivery, then growth.`
  }
  if (/paidly|brand\s*caf|brandcafe|live site|sync/.test(t)) {
    return `On “${miss}”: say “sync live sites” or “work on Paidly” — I pull public pages; I do not invent studio clients or fake invoices.`
  }
  return `Last time I missed “${miss}”. Rephrase around cash, commitments, Paidly, or BrandCafé — or say “build yourself” so I wire a handler.`
}

function remember(
  id: string,
  loop: Finding['loop'],
  severity: Finding['severity'],
  title: string,
  openDetail: string,
  closedDetail: string,
  stillBroken: boolean,
  repairedIds: string[],
  closed: 'fixed' | 'learned' = 'fixed',
): Finding | undefined {
  const done = repairedIds.includes(id)
  if (!stillBroken && !done) return undefined
  return {
    id,
    loop,
    severity,
    title,
    detail: stillBroken ? openDetail : closedDetail,
    status: stillBroken ? 'open' : closed,
  }
}

export function analyze(state: BusinessState): { findings: Finding[]; integrity: number } {
  const findings: Finding[] = []
  const overdue = overdueInvoices(state)
  const unrepaired = overdue.filter((i) => !i.remindedAt && !state.emails.some((e) => e.relatedId === i.id))
  const healthMismatches = state.clients.filter((c) => {
    const late = overdue.some((i) => i.clientId === c.id)
    const quiet = silentClients(state).some((s) => s.id === c.id)
    return c.health === 'healthy' && (late || quiet || c.awaitingFeedback)
  })
  const muteBottleneck = state.projects.filter((p) => p.daysBehind > 0 && !p.bottleneck)
  const overloaded = overloadedPeople(state)
  const extraToday = state.tasks.filter((t) => t.today && t.priority === 'low' && overloaded.some((p) => p.id === t.assigneeId) && t.status !== 'done')
  const bareProjects = state.projects.filter((p) => !state.tasks.some((t) => t.projectId === p.id))
  const unbranded = state.clients.filter((c) => c.status !== 'paused' && !state.brands.some((b) => b.clientId === c.id))
  const lostLeads = state.leads.filter((l) => !['won', 'lost'].includes(l.stage) && !l.nextStep)
  const allMisses = collectMisses(state)
  const recoveredMisses = allMisses.filter((miss) => hasRecovery(state, miss))
  const pendingMisses = allMisses.filter((miss) => !hasRecovery(state, miss))

  const push = (f?: Finding) => {
    if (f) findings.push(f)
  }

  push(remember(
    'repair-overdue-drafts', 'repair', 'critical', 'Overdue cash with no chase',
    `${unrepaired.length} overdue invoices have no reminder draft. I’ll file them in the outbox as drafts.`,
    'Reminder drafts are in the outbox. Waiting for you to send.',
    unrepaired.length > 0, state.repairedIds,
  ))
  push(remember(
    'repair-client-health', 'repair', 'warn', 'Client health is lying',
    `${healthMismatches.map((c) => c.name).join(', ')} marked healthy while money or feedback is stuck.`,
    'Client health now matches money and silence.',
    healthMismatches.length > 0, state.repairedIds,
  ))
  push(remember(
    'repair-bottlenecks', 'repair', 'warn', 'Delay with no bottleneck named',
    muteBottleneck.map((p) => p.name).join(' · '),
    'Delayed projects now have a named bottleneck.',
    muteBottleneck.length > 0, state.repairedIds,
  ))
  push(remember(
    'repair-overload', 'repair', 'warn', 'Low-priority work on overloaded people',
    `I’ll move ${extraToday.length} low-pri tasks off today so overloaded people can finish the real work.`,
    'Low-pri work deferred off overloaded people.',
    extraToday.length > 0, state.repairedIds,
  ))
  push(remember(
    'repair-empty-projects', 'repair', 'info', 'Projects with no tasks',
    bareProjects.map((p) => p.name).join(' · '),
    'Empty projects now have a kickoff task.',
    bareProjects.length > 0, state.repairedIds,
  ))
  push(remember(
    'build-brand-coverage', 'build', 'info', 'Brand kits missing',
    `No kit for ${unbranded.map((c) => c.name).join(', ')}. I’ll grow starter kits so Creative Agent isn’t blind.`,
    'Starter brand kits grown for every active client.',
    unbranded.length > 0, state.repairedIds, 'learned',
  ))
  push(remember(
    'repair-lead-next', 'repair', 'info', 'Leads with no next step',
    lostLeads.map((l) => l.company).join(', '),
    'Every open lead has a next step.',
    lostLeads.length > 0, state.repairedIds,
  ))
  if (allMisses.length > 0) {
    findings.push({
      id: 'build-from-misses',
      loop: 'build',
      severity: 'info',
      title: 'Questions I couldn’t answer',
      detail: pendingMisses.slice(0, 4).join(' · ') || recoveredMisses.slice(0, 4).join(' · ') || 'I’ll grow a skill from the last miss so I don’t fail the same way twice.',
      status: pendingMisses.length === 0 && recoveredMisses.length > 0 ? 'learned' : 'open',
    })
  }

  const mine = mandoToday(state)
  push(remember(
    'analyze-mando-bottleneck', 'analyze', 'warn', 'Mando is still the bottleneck',
    `${mine.length} items due today still sit on the founder. Designer → CEO means these get delegated or systemised.`,
    'Founder load on today-work is contained.',
    mine.length >= 3, state.repairedIds,
  ))

  const projectOnly = state.clients.filter((c) => c.status === 'active' && c.retainer === 0)
  push(remember(
    'analyze-retainer-mix', 'analyze', 'info', 'Clients still buying time, not retainers',
    `${projectOnly.map((c) => c.name).join(', ') || 'None'} — that stalls Level 3 recurring income on the R0 → R1 million climb.`,
    'Active clients are on retainers.',
    projectOnly.length > 0, state.repairedIds,
  ))

  const collected = collectedRevenue(state)
  push(remember(
    'analyze-r1m-progress', 'analyze', collected === 0 ? 'warn' : 'info',
    collected === 0 ? 'R0 of R1 million collected' : `${collected} ZAR toward R1 million`,
    collected === 0
      ? 'Ultimate goal is R1,000,000 verified ZAR collected. Ledger is empty — first rand is a BrandCafé invoice or a Paidly subscriber, not a new app. This is a business finding, not a code job.'
      : `Collected ${collected} toward R1,000,000. Next work is retainers and Paidly MRR, not another brand.`,
    'Collected revenue is moving toward R1 million.',
    collected === 0, state.repairedIds,
  ))

  push(remember(
    'build-browser', 'build', 'info', 'Web learning idle',
    'Browser is connected. I’ll research misses and curriculum for your stack — retainers, Paidly, productising BrandCafé.',
    `Last on the web ${state.lastBrowse ? new Date(state.lastBrowse).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—'}.`,
    !state.lastBrowse, state.repairedIds, 'learned',
  ))

  const cursorBusyNow = state.cursorRun?.status === 'running' || state.cursorRun?.status === 'queued'
  push(remember(
    'build-cursor-hands', 'build', 'info', 'Hands in Cursor',
    cursorBusyNow
      ? `I’m in Cursor building “${state.cursorRun?.title}”. Kill switch is Autopilot / Stop on this page.`
      : state.autopilot
        ? 'Autopilot is on. I am the coding agent: one bounded job from the roadmap, a miss, or an open finding, implemented on a branch. I will not invent features or fake invoices.'
        : 'Autopilot is off. Build yourself ships the next job with retrieved files. Ask me how a file works, or to fix it. Or turn Autopilot on.',
    'I have finished at least one Cursor run in this workspace.',
    ! (state.cursorHistory ?? []).some((r) => r.status === 'finished'),
    state.repairedIds,
    'learned',
  ))

  const open = findings.filter((f) => f.status === 'open')
  const integrity = Math.max(42, 100 - open.filter((f) => f.severity === 'critical').length * 12 - open.filter((f) => f.severity === 'warn').length * 6 - open.filter((f) => f.severity === 'info').length * 2)
  return { findings, integrity }
}

export function applyRepairs(state: BusinessState): { state: BusinessState; applied: string[] } {
  const { findings } = analyze(state)
  let next = { ...state, clients: [...state.clients], projects: [...state.projects], tasks: [...state.tasks], invoices: [...state.invoices], leads: [...state.leads], emails: [...state.emails], brands: [...state.brands], people: [...state.people], repairedIds: [...state.repairedIds], activity: [...state.activity] }
  const applied: string[] = []
  const now = new Date().toISOString()
  const log = (text: string) => {
    next.activity = [{ id: uid('log'), text, at: now }, ...next.activity]
  }

  for (const f of findings) {
    if (f.status !== 'open') continue

    if (f.id === 'repair-overdue-drafts') {
      const drafts = reminderDrafts(next).filter((d) => !next.emails.some((e) => e.relatedId === d.relatedId))
      if (drafts.length) {
        next.emails = [...next.emails, ...drafts.map((d) => ({ ...d, status: 'draft' as const }))]
        applied.push(f.id)
        log(`Aria repaired: drafted ${drafts.length} payment reminders (not sent).`)
      }
    }

    if (f.id === 'repair-client-health') {
      const overdue = overdueInvoices(next)
      const quiet = silentClients(next)
      next.clients = next.clients.map((c) => {
        const late = overdue.some((i) => i.clientId === c.id)
        const q = quiet.some((s) => s.id === c.id)
        if (late) return { ...c, health: 'risk' as const }
        if (q || c.awaitingFeedback) return { ...c, health: 'watch' as const }
        return c
      })
      applied.push(f.id)
      log('Aria repaired: client health now matches money and silence.')
    }

    if (f.id === 'repair-bottlenecks') {
      next.projects = next.projects.map((p) =>
        p.daysBehind > 0 && !p.bottleneck
          ? { ...p, bottleneck: `${p.daysBehind}d behind — named by Aria during self-repair.` }
          : p,
      )
      applied.push(f.id)
      log('Aria repaired: named missing bottlenecks on delayed projects.')
    }

    if (f.id === 'repair-overload') {
      const overloaded = overloadedPeople(next)
      next.tasks = next.tasks.map((t) =>
        t.today && t.priority === 'low' && overloaded.some((p) => p.id === t.assigneeId) && t.status !== 'done'
          ? { ...t, today: false, due: '2026-08-17' }
          : t,
      )
      next.people = next.people.map((p) =>
        p.load > p.capacity ? { ...p, load: Math.max(p.capacity - 4, p.load - 10) } : p,
      )
      applied.push(f.id)
      log('Aria repaired: deferred low-pri work off overloaded people.')
    }

    if (f.id === 'repair-empty-projects') {
      const missing = next.projects.filter((p) => !next.tasks.some((t) => t.projectId === p.id))
      const kickoffDue = nextMonday()
      const extras = missing.map((p) => ({
        id: uid('t'),
        title: `Kickoff — ${p.name.replace(/^.* — /, '')}`,
        due: kickoffDue,
        priority: 'low' as const,
        status: 'backlog' as const,
        projectId: p.id,
        clientId: p.clientId,
        assigneeId: p.ownerId,
        today: false,
      }))
      next.tasks = [...next.tasks, ...extras]
      applied.push(f.id)
      log(`Aria repaired: created ${extras.length} kickoff tasks for empty projects (deferred off the founder's today-board).`)
    }

    if (f.id === 'analyze-mando-bottleneck') {
      const me = mandoPerson(next)
      if (!me) continue
      const today = todayISO()
      const monday = nextMonday()
      const delegatable = next.tasks.filter(
        (t) => t.assigneeId === me.id && t.due === today && t.status !== 'done' && isDelegatableTask(t),
      )
      if (!delegatable.length) continue
      next.tasks = next.tasks.map((t) =>
        delegatable.some((d) => d.id === t.id)
          ? { ...t, due: monday, today: false, priority: t.priority === 'high' ? t.priority : ('low' as const) }
          : t,
      )
      next.people = next.people.map((p) =>
        p.id === me.id ? { ...p, load: Math.max(0, p.load - delegatable.length * 8) } : p,
      )
      applied.push(f.id)
      log(`Aria repaired: deferred ${delegatable.length} production task${delegatable.length === 1 ? '' : 's'} off Mando to ${weekdayName(monday)} — founder time for cash and Paidly.`)
    }

    if (f.id === 'repair-lead-next') {
      next.leads = next.leads.map((l) => (!l.nextStep && !['won', 'lost'].includes(l.stage) ? { ...l, nextStep: 'Aria: book a follow-up this week' } : l))
      applied.push(f.id)
      log('Aria repaired: every open lead now has a next step.')
    }

    if (f.id === 'build-brand-coverage') {
      const missing = next.clients.filter((c) => c.status !== 'paused' && !next.brands.some((b) => b.clientId === c.id))
      next.brands = [
        ...next.brands,
        ...missing.map((c) => ({
          id: uid('b'),
          clientId: c.id,
          voice: `Starter voice for ${c.name} (${c.industry}). Grown by Aria until a real kit lands.`,
          colors: ['#0B1220', '#00D2FF', '#A855F7', '#F4F7FF'],
          typefaces: ['Outfit', 'Rajdhani'],
          direction: 'Hold the line until we workshop. No stock clichés.',
        })),
      ]
      applied.push(f.id)
      log(`Aria built: starter brand kits for ${missing.map((c) => c.name).join(', ')}.`)
    }
  }

  next.repairedIds = [...new Set([...next.repairedIds, ...applied])]
  return { state: next, applied }
}

export function growSkills(state: BusinessState): { state: BusinessState; grown: Skill[] } {
  const grown: Skill[] = []
  let skills = [...state.skills]

  const learn = (skill: Omit<Skill, 'id' | 'uses' | 'createdAt'>) => {
    const exists = skills.some((s) => s.name === skill.name || (s.keywords[0] && s.keywords[0] === skill.keywords[0] && s.keywords[1] === skill.keywords[1]))
    if (exists) return
    const full: Skill = { ...skill, id: uid('sk'), uses: 0, createdAt: new Date().toISOString() }
    skills = [full, ...skills]
    grown.push(full)
  }

  for (const note of state.roadmap) {
    const keys = keywords(note.text)
    if (keys.length < 2) continue
    learn({
      name: note.text.slice(0, 48),
      keywords: keys.slice(0, 5),
      reply: `I grew this from your build note: “${note.text}”. It’s now a skill I can answer to. Keep talking and I’ll thicken it.`,
      agentId: guessAgent(note.text),
      source: 'mando',
    })
  }

  for (const miss of collectMisses(state).slice(0, 8)) {
    const keys = keywords(miss)
    if (keys.length < 1) continue
    learn({
      name: recoverySkillName(miss),
      keywords: keys.slice(0, 5),
      reply: recoveryReply(miss),
      agentId: guessAgent(miss),
      source: 'self',
    })
  }

  for (const seed of FOUNDER_SKILLS) {
    learn({ ...seed })
  }

  if (!skills.some((s) => s.name === 'Self diagnostic')) {
    learn({
      name: 'Self diagnostic',
      keywords: ['yourself', 'self', 'diagnose', 'integrity', 'kernel'],
      reply: 'I scan, repair, and grow for Mando first — cash, commitments, then assets. Ask me to analyse myself, repair myself, or show my skills.',
      agentId: 'ceo',
      source: 'self',
    })
  }
  if (!skills.some((s) => s.name === 'Repo literacy')) {
    learn({
      name: 'Repo literacy',
      keywords: ['code', 'typescript', 'src/', 'explain file', 'how does', 'typeerror'],
      reply: 'I read this repo — map, grep, file excerpts. Ask how something works and I’ll retrieve it. Ask me to fix it and I’ll ship a bounded Cursor job with that context. I will not invent source or a second app.',
      agentId: 'ceo',
      source: 'self',
    })
  }
  if (!skills.some((s) => s.name === 'Cursor hands')) {
    learn({
      name: 'Cursor hands',
      keywords: ['cursor', 'build yourself', 'implement', 'ship this', 'autopilot', 'work on paidly'],
      reply: 'I write code in this workspace, with real files retrieved first. Say “build yourself”, “work on Paidly”, “explain brain.ts”, or “fix the type error”. Autopilot writes on a branch unless you turn Branch writes off.',
      agentId: 'ceo',
      source: 'self',
    })
  }
  if (!skills.some((s) => s.name === 'Voice check')) {
    learn({
      name: 'Voice check',
      keywords: ['hear me', 'listening', 'mic check', 'voice check', 'you there'],
      reply: 'Yes, Mando — I hear you. Speak naturally. Tap the mic or turn Live on. Say “stop” when you want me quiet.',
      agentId: 'ceo',
      source: 'self',
    })
  }
  if (!skills.some((s) => s.name === 'Aria not area')) {
    learn({
      name: 'Aria not area',
      keywords: ['area'],
      reply: 'You said “area” — I’m Aria, your holographic COO. Speech recognition often mishears. I’m here. What do you need?',
      agentId: 'ceo',
      source: 'self',
    })
  }

  const activity = grown.length
    ? [{ id: uid('log'), text: `Aria built ${grown.length} new skill${grown.length === 1 ? '' : 's'}: ${grown.map((g) => g.name).join(', ')}`, at: new Date().toISOString() }, ...state.activity]
    : state.activity
  const repairedIds = grown.some((g) => g.name.startsWith('Recovered:'))
    ? [...new Set([...state.repairedIds, 'build-from-misses'])]
    : state.repairedIds

  return { state: { ...state, skills, activity, repairedIds }, grown }
}

export function evolve(state: BusinessState): BusinessState {
  const merged = { ...state, misses: collectMisses(state) }
  const repaired = applyRepairs(merged)
  const grown = growSkills(repaired.state)
  const { findings, integrity } = analyze(grown.state)
  const next = {
    ...grown.state,
    findings,
    integrity,
    notices: detectNotices(grown.state),
    opportunities: detectOpportunities(grown.state),
    lastScan: new Date().toISOString(),
  }
  return maybeNightlyImprove(next)
}

export function matchSkill(text: string, skills: Skill[]): Skill | undefined {
  const t = text.toLowerCase()
  let best: { skill: Skill; score: number } | undefined
  for (const skill of skills) {
    if (skill.source === 'cursor') continue
    const score = skill.keywords.filter((k) => t.includes(k.toLowerCase())).length
    if (score === 0) continue
    const need = Math.min(2, skill.keywords.length)
    if (score >= need && (!best || score > best.score)) best = { skill, score }
  }
  return best?.skill
}

export function matchWiredSkill(text: string, skills: Skill[]): Skill | undefined {
  const t = text.toLowerCase()
  let best: { skill: Skill; score: number } | undefined
  for (const skill of skills) {
    if (skill.source !== 'cursor') continue
    const nameHit = t.includes(skill.name) || t.includes(skill.name.replace(/-/g, ' '))
    const score = skill.keywords.filter((k) => k.length > 2 && t.includes(k.toLowerCase())).length + (nameHit ? 3 : 0)
    if (score === 0) continue
    const need = nameHit ? 1 : 2
    if (score >= need && (!best || score > best.score)) best = { skill, score }
  }
  return best?.skill
}

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

function guessAgent(text: string): AgentId {
  const t = text.toLowerCase()
  if (/invoice|pay|cash|money|finance/.test(t)) return 'finance'
  if (/client|feedback|follow/.test(t)) return 'client'
  if (/project|task|deadline|team/.test(t)) return 'project'
  if (/lead|campaign|market/.test(t)) return 'marketing'
  if (/brand|design|brief|creative/.test(t)) return 'creative'
  return 'ceo'
}
