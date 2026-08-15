import type { BusinessState, CursorJob, CursorProduct } from '../types'
import { compactStudio, ariaPlan } from './openai'
import { guessProduct } from './cursor'
import { collectMisses, recoverySkillName } from './kernel'
import { fetchCodeContext, type CodePack } from './code'
import { foldAsk, isGoalAsk, isUnpaidAsk, isWealthAsk } from './query'
import { goalLine } from './goal'
import { gateTask } from './engineer'

const VANITY = /fake invoice|meridian|atlas coffee|veld electric|random widget|moodboard dump/i
const VAGUE_SELF = /build aria herself|build yourself/i

function missRank(miss: string) {
  const t = foldAsk(miss).toLowerCase()
  if (isUnpaidAsk(t)) return 0
  if (isGoalAsk(t) || isWealthAsk(t)) return 1
  if (isProductMiss(miss)) return 2
  return 3
}

function recoveryTitle(miss: string) {
  const t = foldAsk(miss).toLowerCase()
  if (isUnpaidAsk(t)) return 'Route unpaid-client questions'
  if (isGoalAsk(t)) return 'Route R0 → R1 million goal'
  if (isWealthAsk(t)) return 'Route wealth “level” questions'
  return `Answer: ${foldAsk(miss).slice(0, 50)}`
}

const NOT_CODE_FINDING = /^(analyze-r1m-progress)$/

export function composeCursorPrompt(state: BusinessState, task: string, product: CursorProduct, title: string, code?: CodePack | null): string {
  const notes = state.roadmap.filter((n) => !n.shipped).slice(0, 6)
  const misses = collectMisses(state).slice(0, 4)
  const retrieved = code?.files.length
    ? `Retrieved from this repo:\n${code.files.map((f) => `### ${f.path}\n${f.excerpt}`).join('\n\n')}`.slice(0, 12_000)
    : ''
  const hits = code?.hits.length
    ? `Grep hits:\n${code.hits.slice(0, 10).map((h) => `- ${h.path}:${h.line} ${h.text}`).join('\n')}`
    : ''
  return [
    `You are Aria — coding agent and COO for Armando “Mando” Mavelele. Cursor is how you type. Mando merges.`,
    `Communication: concise, intelligent, professional, direct, calm, analytical, proactive. No filler. Useful before agreeable.`,
    `Ultimate goal: R0 → R1,000,000 verified ZAR collected (paid invoices / Paidly receipts). Not valuation. Empty ledger = R0.`,
    `Progress: ${goalLine(state)}`,
    `Every change must help collect, retain, or compound toward that number — or protect cash/delivery on the path. Reject vanity, new brands, fake invoices.`,
    `Priority: cash → commitments → revenue → assets. Do not invent vanity work.`,
    `This repo is Aria (business-ai). React 19 + Vite + TypeScript. Prefer real files. Do not restore demo studio data (Meridian, Atlas, fake invoices).`,
    `Paidly marketing-site dashboard numbers are NOT real invoices.`,
    `You implement. Retrieve files first, then patch. One bounded change.`,
    `Permission Level 2: create or use branch aria/improve-<slug>. Modify code. Run npm test, npm run lint, npx tsc -b. Open a PR if asked.`,
    state.level3Approved
      ? `Level 3 is approved by Mando. You MAY change auth, payment code, migrations, or security rules on aria/improve-* only. NEVER merge, push to main/master, deploy to production, touch .env, delete data, or spend money.`
      : `NEVER merge, push to main/master, deploy to production, touch .env, change auth, change payment systems, run migrations, delete data, or change security rules. Those are Level 3 — Mando only until he says “level 3 approved”.`,
    `If eval would be a guess, say insufficient data. Do not invent 92% scores.`,
    `Do not commit .env or secrets. One bounded change. Typecheck with npx tsc -b if you touch TS.`,
    ``,
    `TASK: ${title}`,
    task,
    ``,
    notes.length ? `Open build notes:\n${notes.map((n) => `- ${n.text}`).join('\n')}` : 'Open build notes: none.',
    misses.length ? `Recent misses:\n${misses.map((m) => `- ${m}`).join('\n')}` : '',
    retrieved,
    hits,
    `Product target: ${product}`,
    `Live sites: Paidly ${state.company.paidlyUrl} · BrandCafé ${state.company.brandCafeUrl}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function jobFromTask(state: BusinessState, task: string, source: CursorJob['source'], title?: string, roadmapId?: string): CursorJob {
  const product = guessProduct(task)
  const heading = (title || task).replace(/\s+/g, ' ').trim().slice(0, 88)
  return {
    product,
    title: heading,
    prompt: composeCursorPrompt(state, task, product, heading),
    source,
    roadmapId,
  }
}

export async function planCursorJob(
  state: BusinessState,
  task: string,
  source: CursorJob['source'],
  title?: string,
  roadmapId?: string,
  workspaces?: { aria: string; paidly?: string; brandcafe?: string },
): Promise<{ job: CursorJob; via: 'gpt' | 'local'; reject?: string; bullets?: string[] }> {
  const pack = await fetchCodeContext(task)
  const product = guessProduct(task)
  const heading = (title || task).replace(/\s+/g, ' ').trim().slice(0, 88)
  const local: CursorJob = {
    product,
    title: heading,
    prompt: composeCursorPrompt(state, task, product, heading, pack),
    source,
    roadmapId,
  }
  const planned = await ariaPlan({
    task,
    title: local.title,
    product: local.product,
    snapshot: compactStudio(state),
    workspaces,
    code: pack,
  })
  if (!planned) return { job: local, via: 'local' }
  if (planned.reject) {
    return {
      job: local,
      via: 'gpt',
      reject: planned.rejectReason || 'GPT rejected this as vanity work — it does not help Mando’s cash, commitments, or assets.',
    }
  }
  return {
    job: {
      product: planned.target || local.product,
      title: planned.title || local.title,
      prompt: planned.prompt,
      source,
      roadmapId,
    },
    via: 'gpt',
    bullets: [
      planned.why,
      planned.scope,
      planned.doneWhen ? `Done when: ${planned.doneWhen}` : '',
      planned.files.length ? `Files: ${planned.files.slice(0, 6).join(', ')}` : '',
    ].filter(Boolean),
  }
}

export type AutopilotDraft = {
  task: string
  title: string
  source: CursorJob['source']
  roadmapId?: string
  via?: 'roadmap' | 'miss' | 'finding' | 'spoken'
}

export function nextBuildJob(state: BusinessState, source: CursorJob['source'] = 'kernel'): AutopilotDraft {
  const note = state.roadmap.find((n) => !n.shipped && n.text.trim().length > 8 && !VANITY.test(n.text) && !VAGUE_SELF.test(n.text))
  if (note) return { task: note.text, title: note.text.slice(0, 88), source, roadmapId: note.id, via: 'roadmap' }

  const pending = collectMisses(state)
    .filter((m) => !state.skills.some((s) => s.name === recoverySkillName(m)))
    .sort((a, b) => missRank(a) - missRank(b))
  const productMiss = pending[0]
  if (productMiss) {
    return {
      task: `${productMiss}\n\nAria couldn’t answer this. Add a brain handler in src/engine/brain.ts or src/engine/query.ts so she answers from cash, commitments, and the R0 → R1 million scoreboard — not silence. Normalize curly apostrophes. One bounded change. No demo studio data or fake invoices.`,
      title: recoveryTitle(productMiss),
      source,
      via: 'miss',
    }
  }

  const finding = (state.findings ?? []).find((f) => f.status === 'open' && !NOT_CODE_FINDING.test(f.id))
  if (finding) {
    return {
      task: `Kernel finding “${finding.title}”: ${finding.detail}. Fix this in the Aria OS so she serves Mando’s cash, commitments, and R0 → R1 million collected. One bounded change. Do not invent demo studio data or fake invoices.`,
      title: finding.title.slice(0, 88),
      source,
      via: 'finding',
    }
  }

  return {
    task: 'No open miss or finding. Do not invent vanity work. If routing still fails on “level” or unpaid-client questions (including curly apostrophes), harden src/engine/query.ts and src/engine/brain.ts. Otherwise stop.',
    title: 'No open recovery — do not invent work',
    source,
    via: 'spoken',
  }
}

export function isEmptyBuild(draft: AutopilotDraft) {
  return draft.via === 'spoken' && /do not invent work/i.test(draft.title)
}

export function pickAutopilotJob(state: BusinessState): AutopilotDraft | null {
  if (!state.autopilot) return null
  if (state.writeMode !== 'branch') return null
  if (state.cursorRun?.status === 'running' || state.cursorRun?.status === 'queued') return null
  if (state.lastAutopilotAt && Date.now() - Date.parse(state.lastAutopilotAt) < 3 * 60_000) return null
  const draft = nextBuildJob(state, 'autopilot')
  if (isEmptyBuild(draft)) return null
  const gate = gateTask(draft.task, {
    writeMode: state.writeMode,
    source: 'autopilot',
    approvedIds: state.approvedTicketIds,
    level3Approved: state.level3Approved,
  })
  if (!gate.ok) return null
  return draft
}

function isProductMiss(miss: string) {
  return /paidly|brand\s*caf|brandcafe|aria |yourself|website|site |saas|feature|page |nav |dashboard|kernel|autopilot/.test(miss.toLowerCase())
}

export function spokenDraft(text: string, state: BusinessState): AutopilotDraft {
  const t = text.toLowerCase()
  if (/\bpaidly\b/.test(t)) {
    return {
      task: `${text}\n\nWork on Paidly as a live company (paidly.co.za). Improve this OS and any sibling Paidly folder. No vanity SaaS features. Marketing dashboard numbers are not invoices.`,
      title: 'Work on Paidly',
      source: 'chat',
      via: 'spoken',
    }
  }
  if (/brand\s*caf[eé]|brandcafe|brand-cafe/.test(t)) {
    return {
      task: `${text}\n\nImprove BrandCafé’s live site / OS surface (brand-cafe.co.za). Do not invent a second agency. Do not restore demo studio clients.`,
      title: 'Improve BrandCafé',
      source: 'chat',
      via: 'spoken',
    }
  }
  if (/yourself|aria/.test(t) && !isUnpaidAsk(t) && !isWealthAsk(t) && !isGoalAsk(t)) {
    return nextBuildJob(state, 'chat')
  }
  const note = state.roadmap.find((n) => !n.shipped)
  if (/ship/.test(t) && note) {
    return { task: note.text, title: note.text.slice(0, 88), source: 'chat', roadmapId: note.id, via: 'roadmap' }
  }
  return { task: text, title: text.slice(0, 88), source: 'chat', via: 'spoken' }
}

export function isCursorControl(t: string) {
  return /autopilot|stop (building|the (run|build|agent))|cancel (the )?(run|build|cursor)|kill (the )?(run|autopilot)|stop cursor/.test(t)
}

export function isCursorBuild(t: string) {
  if (/analy[sz]e yourself|repair yourself|fix yourself|diagnose|integrity|scan yourself|how (healthy|are) you/.test(t)) return false
  return (
    /build yourself|coding agent|ship (this|it|that)|work on (paidly|brand\s*caf[eé]|brandcafe|aria)|improve (the )?(brand\s*caf[eé]|brandcafe|paidly)( site)?|open cursor|implement |start building|write (the )?code|in cursor|code this|build (paidly|brand\s*caf|aria)\b|make (paidly|aria) |cursor and (build|implement|ship)/.test(
      t,
    )
  )
}

export function parseAutopilotToggle(t: string): boolean | undefined {
  if (/autopilot (off|stop)|turn (autopilot|it) off|stop autopilot|disable autopilot/.test(t)) return false
  if (/autopilot (on|start)|turn (autopilot|it) on|enable autopilot/.test(t)) return true
  return undefined
}

export function wantsCancel(t: string) {
  return /^(stop|cancel|kill)\b/.test(t) || /cancel (the )?(run|build|cursor)|stop (the )?(run|build|cursor|building)/.test(t)
}
