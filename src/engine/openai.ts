import type { AgentId, BusinessState, Knowledge } from '../types'
import type { CodePack } from './code'
import { goalLine } from './goal'

export type StudioSnapshot = {
  company: {
    name: string
    tagline: string
    owner: string
    assistant: string
    currency: string
    monthTarget: number
    revenueMtd: number
    goal: string
    paidlyUrl: string
    brandCafeUrl: string
    lastLiveSync?: string
  }
  clients: { name: string; health: string; retainer: number; status: string }[]
  projects: { name: string; status: string; due: string; daysBehind: number; bottleneck?: string }[]
  invoices: { overdue: number; overdueTotal: number; paid: number; sent: number }
  skills: string[]
  roadmap: string[]
  notices: string[]
  opportunities: { title: string; verdict: string }[]
  misses: string[]
  knowledge: string[]
}

export type ThinkRequest = {
  text: string
  intent: string
  snapshot: StudioSnapshot
  research?: { query: string; items: { title: string; takeaway: string; url?: string }[] }
  skill?: { name: string; body: string }
  voice?: boolean
  code?: CodePack
  draft?: { text: string; bullets?: string[] }
  history?: { role: 'user' | 'assistant'; text: string }[]
}

export type ThinkReply = {
  text: string
  bullets?: string[]
  agentId?: AgentId
}

export type ThinkResult =
  | { ok: true; reply: ThinkReply }
  | { ok: false; error: string }

const AGENTS: AgentId[] = ['ceo', 'client', 'project', 'finance', 'marketing', 'creative']

/** Mechanical OS actions — local brain stays. Everything Mando reads as a reply goes through ChatGPT. */
const SKIP_CHATGPT = new Set([
  'live-sync',
  'ignore',
  'ack',
  'voice-check',
  'autopilot-on',
  'autopilot-off',
  'write-mode',
  'cursor-cancel',
  'cursor-busy',
  'improve-run',
  'level3-approve',
])

export function shouldUseGpt(intent: string) {
  return !SKIP_CHATGPT.has(intent)
}

export function compactStudio(state: BusinessState): StudioSnapshot {
  const overdue = state.invoices.filter((i) => i.status === 'overdue')
  return {
    company: {
      name: state.company.name,
      tagline: state.company.tagline,
      owner: state.company.ownerShort || state.company.owner,
      assistant: state.company.assistantName,
      currency: state.company.currency,
      monthTarget: state.company.monthTarget,
      revenueMtd: state.company.revenueMtd,
      goal: goalLine(state),
      paidlyUrl: state.company.paidlyUrl,
      brandCafeUrl: state.company.brandCafeUrl,
      lastLiveSync: state.lastLiveSync,
    },
    clients: state.clients.slice(0, 20).map((c) => ({
      name: c.name,
      health: c.health,
      retainer: c.retainer,
      status: c.status,
    })),
    projects: state.projects.slice(0, 16).map((p) => ({
      name: p.name,
      status: p.status,
      due: p.due,
      daysBehind: p.daysBehind,
      bottleneck: p.bottleneck,
    })),
    invoices: {
      overdue: overdue.length,
      overdueTotal: overdue.reduce((s, i) => s + i.amount, 0),
      paid: state.invoices.filter((i) => i.status === 'paid').length,
      sent: state.invoices.filter((i) => i.status === 'sent').length,
    },
    skills: state.skills.slice(0, 12).map((s) => s.name),
    roadmap: state.roadmap.slice(0, 8).map((r) => r.text),
    notices: state.notices.slice(0, 6).map((n) => n.text),
    opportunities: state.opportunities.slice(0, 5).map((o) => ({ title: o.title, verdict: o.verdict })),
    misses: state.misses.slice(0, 6),
    knowledge: state.knowledge.slice(0, 4).map((k) => k.takeaway),
  }
}

export function researchDigest(query: string, items: Knowledge[]): ThinkRequest['research'] {
  return {
    query,
    items: items.slice(0, 4).map((k) => ({
      title: k.title.slice(0, 80),
      takeaway: k.takeaway.slice(0, 280),
      url: k.url,
    })),
  }
}

export async function ariaThink(input: ThinkRequest): Promise<ThinkResult> {
  try {
    const res = await fetch('/__aria/think', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      text?: string
      bullets?: string[]
      agentId?: string
      error?: string
    }
    if (res.status === 503) {
      return { ok: false, error: data.error?.trim() || 'ChatGPT is not configured' }
    }
    if (!res.ok) return { ok: false, error: data.error?.trim() || `ChatGPT HTTP ${res.status}` }
    if (!data.ok || !data.text?.trim()) return { ok: false, error: 'ChatGPT returned an empty reply' }
    const agentId = AGENTS.includes(data.agentId as AgentId) ? (data.agentId as AgentId) : undefined
    return {
      ok: true,
      reply: {
        text: data.text.trim(),
        bullets: Array.isArray(data.bullets) ? data.bullets.map(String).slice(0, 6) : undefined,
        agentId,
      },
    }
  } catch {
    return { ok: false, error: 'ChatGPT request failed' }
  }
}

export type PlanBrief = {
  title: string
  why: string
  files: string[]
  scope: string
  doneWhen: string
  prompt: string
  target: 'aria' | 'paidly' | 'brandcafe'
  reject: boolean
  rejectReason?: string
}

export async function ariaPlan(input: {
  task: string
  title: string
  product?: string
  snapshot: StudioSnapshot
  workspaces?: { aria: string; paidly?: string; brandcafe?: string }
  code?: CodePack | null
}): Promise<PlanBrief | null> {
  try {
    const res = await fetch('/__aria/think', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: input.task,
        intent: 'plan',
        snapshot: input.snapshot,
        title: input.title,
        product: input.product,
        workspaces: input.workspaces,
        task: input.task,
        code: input.code ?? undefined,
      }),
      signal: AbortSignal.timeout(50_000),
    })
    if (res.status === 503) return null
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; brief?: PlanBrief }
    if (!data.ok || !data.brief) return null
    return data.brief
  } catch {
    return null
  }
}
