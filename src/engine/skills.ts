import type { AgentId, BusinessState, Skill } from '../types'
import { uid } from '../lib/format'

export type CursorSkillInfo = {
  name: string
  description: string
  source: 'user' | 'project' | 'claude'
  dir: string
}

export type CursorSkillMatch = CursorSkillInfo & { body: string; score?: number }

const STOP = new Set(['the', 'a', 'an', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'with', 'your', 'you', 'me', 'i', 'it', 'this', 'that', 'use', 'when', 'skill'])

export const RESEARCH_SKILL_NAMES = new Set([
  'web-research',
  'competitive-intelligence',
  'trend-detection',
  'marketing-intelligence',
  'lead-intelligence',
])
export const DECISION_SKILL_NAMES = new Set([
  'financial-decision-making',
  'ceo-decision-support',
  'decision-journal',
  'hiring-intelligence',
  'strategic-thinking',
  'opportunity-detection',
  'delegation',
])

export async function listCursorSkills(): Promise<CursorSkillInfo[]> {
  try {
    const res = await fetch('/__aria/skills')
    const data = (await res.json()) as { ok?: boolean; skills?: CursorSkillInfo[] }
    if (!data.ok || !Array.isArray(data.skills)) return []
    return data.skills
  } catch {
    return []
  }
}

export async function matchCursorSkills(text: string): Promise<CursorSkillMatch[]> {
  try {
    const res = await fetch('/__aria/skills/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    const data = (await res.json()) as { ok?: boolean; skills?: CursorSkillMatch[] }
    if (!data.ok || !Array.isArray(data.skills)) return []
    return data.skills.filter((s) => s?.name && s.body)
  } catch {
    return []
  }
}

export async function readCursorSkill(name: string): Promise<CursorSkillMatch | null> {
  try {
    const res = await fetch(`/__aria/skills/${encodeURIComponent(name)}`)
    const data = (await res.json()) as { ok?: boolean; skill?: CursorSkillMatch }
    if (!data.ok || !data.skill?.body) return null
    return data.skill
  } catch {
    return null
  }
}

function keywordsFrom(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

function guessAgent(text: string): AgentId {
  const t = text.toLowerCase()
  if (/invoice|pay|cash|money|finance|roi|margin/.test(t)) return 'finance'
  if (/client|feedback|follow/.test(t)) return 'client'
  if (/project|task|deadline|team|utili[sz]ation/.test(t)) return 'project'
  if (/lead|campaign|market|sales|competitor/.test(t)) return 'marketing'
  if (/brand|design|brief|creative/.test(t)) return 'creative'
  return 'ceo'
}

export function learnCursorCatalog(state: BusinessState, catalog: CursorSkillInfo[]): { state: BusinessState; grown: number } {
  if (!catalog.length) return { state, grown: 0 }
  let skills = [...state.skills]
  let grown = 0
  for (const item of catalog) {
    const exists = skills.some((s) => s.source === 'cursor' && s.name === item.name)
    if (exists) continue
    const keys = [...item.name.split('-').filter((w) => w.length > 2), ...keywordsFrom(item.description)].slice(0, 8)
    const skill: Skill = {
      id: uid('sk'),
      name: item.name,
      keywords: keys.length ? keys : [item.name],
      reply: `I follow the Cursor skill ${item.name}`,
      agentId: guessAgent(`${item.name} ${item.description}`),
      source: 'cursor',
      origin: item.source,
      description: item.description.slice(0, 280),
      uses: 0,
      createdAt: new Date().toISOString(),
    }
    skills = [skill, ...skills]
    grown += 1
  }
  if (!grown) return { state, grown: 0 }
  return {
    state: {
      ...state,
      skills,
      activity: [
        { id: uid('log'), text: `Aria wired ${grown} Cursor skill${grown === 1 ? '' : 's'} — same skills as Cursor.`, at: new Date().toISOString() },
        ...state.activity,
      ],
    },
    grown,
  }
}
