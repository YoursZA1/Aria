import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

type HttpReq = {
  method?: string
  on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void
}
type HttpRes = { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }

const BODY_CAP = 12_000
const CACHE_MS = 5_000
const STOP = new Set([
  'the', 'a', 'an', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'with', 'your', 'you', 'me', 'i', 'it',
  'this', 'that', 'use', 'when', 'skill', 'from', 'into', 'as', 'is', 'are', 'be', 'by', 'at', 'if',
  'not', 'no', 'do', 'does', 'will', 'can', 'should', 'must', 'than', 'then', 'also', 'any', 'all',
])

export type SkillSource = 'user' | 'project' | 'claude'

export type SkillIndex = {
  name: string
  description: string
  source: SkillSource
  dir: string
  path: string
}

export const INVESTIGATE_RULE =
  "Never simply answer Mando’s question when a better answer requires investigation.\n" +
  "If she doesn't have enough information: Research it.\n" +
  "If the information is in your systems: Retrieve it.\n" +
  "If numbers are involved: Calculate them.\n" +
  "If there are competing options: Compare them.\n" +
  "If there's a risk: Surface it.\n" +
  "If there's an opportunity: Quantify it.\n" +
  "If Mando's assumption appears wrong: Challenge it respectfully."

type Cache = { at: number; skills: SkillIndex[] }
let cache: Cache | null = null

function roots(): { dir: string; source: SkillSource }[] {
  return [
    { dir: join(homedir(), '.cursor', 'skills'), source: 'user' },
    { dir: join(process.cwd(), '.cursor', 'skills'), source: 'project' },
    { dir: join(homedir(), '.claude', 'skills'), source: 'claude' },
  ]
}

function parseField(fm: string, key: string): string {
  const block = fm.match(new RegExp(`^${key}:\\s*[>|]-?\\s*\\n((?:[ \\t]+.*\\n?)*)`, 'm'))
  if (block) {
    return block[1]
      .split('\n')
      .map((line) => line.replace(/^[ \t]+/, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const quoted = fm.match(new RegExp(`^${key}:\\s*"([^"]*)"`, 'm'))
  if (quoted) return quoted[1].trim()
  const single = fm.match(new RegExp(`^${key}:\\s*'([^']*)'`, 'm'))
  if (single) return single[1].trim()
  const plain = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  if (plain) {
    const v = plain[1].trim()
    if (v === '|' || v === '>' || v === '>-' || v === '|-') return ''
    return v.replace(/^["']|["']$/g, '').trim()
  }
  return ''
}

function parseFrontmatter(raw: string): { name: string; description: string } | null {
  const trimmed = raw.replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('---')) return { name: '', description: '' }
  const end = trimmed.indexOf('\n---', 3)
  if (end < 0) return { name: '', description: '' }
  const fm = trimmed.slice(3, end).replace(/^\s*\n/, '')
  return {
    name: parseField(fm, 'name'),
    description: parseField(fm, 'description'),
  }
}

function listDirSkills(root: string, source: SkillSource): SkillIndex[] {
  if (!existsSync(root)) return []
  const resolved = resolve(root)
  if (resolved.includes(`${join('.cursor', 'skills-cursor')}`)) return []
  let entries: string[] = []
  try {
    entries = readdirSync(root)
  } catch {
    return []
  }
  const out: SkillIndex[] = []
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const dir = join(root, entry)
    const path = join(dir, 'SKILL.md')
    if (!existsSync(path)) continue
    try {
      const raw = readFileSync(path, 'utf8')
      const meta = parseFrontmatter(raw)
      const name = (meta?.name || entry).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
      if (!name) continue
      out.push({
        name,
        description: (meta?.description || '').slice(0, 1024),
        source,
        dir: basename(dir),
        path,
      })
    } catch {
      /* unreadable skill — skip */
    }
  }
  return out
}

export function indexSkills(force = false): SkillIndex[] {
  const now = Date.now()
  if (!force && cache && now - cache.at < CACHE_MS) return cache.skills
  const seen = new Set<string>()
  const skills: SkillIndex[] = []
  for (const root of roots()) {
    for (const skill of listDirSkills(root.dir, root.source)) {
      const key = `${skill.source}:${skill.name}`
      if (seen.has(key)) continue
      seen.add(key)
      skills.push(skill)
    }
  }
  cache = { at: now, skills }
  return skills
}

export function skillCount(): number {
  return indexSkills().length
}

export function publicSkills() {
  return indexSkills().map(({ name, description, source, dir }) => ({ name, description, source, dir }))
}

export function readSkillBody(name: string): { name: string; description: string; source: SkillSource; dir: string; body: string } | null {
  const want = name.trim().toLowerCase()
  if (!want) return null
  const hit = indexSkills().find((s) => s.name === want) ?? indexSkills().find((s) => s.dir.toLowerCase() === want)
  if (!hit) return null
  try {
    const body = readFileSync(hit.path, 'utf8').slice(0, BODY_CAP)
    return { name: hit.name, description: hit.description, source: hit.source, dir: hit.dir, body }
  } catch {
    return null
  }
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

export function matchSkills(text: string, limit = 2) {
  const ask = text.toLowerCase()
  const askTokens = new Set(tokens(text))
  if (!ask.trim()) return []
  const ranked = indexSkills()
    .map((skill) => {
      const nameParts = skill.name.split('-').filter(Boolean)
      let score = 0
      if (ask.includes(skill.name) || ask.includes(skill.name.replace(/-/g, ' '))) score += 8
      for (const part of nameParts) {
        if (part.length > 2 && askTokens.has(part)) score += 3
      }
      for (const tok of tokens(skill.description)) {
        if (askTokens.has(tok)) score += 1
      }
      return { skill, score }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return ranked
    .map((row) => {
      const full = readSkillBody(row.skill.name)
      if (!full) return null
      return { ...full, score: row.score }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
}

function json(res: HttpRes, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

export async function handleSkillsRequest(
  parsed: URL,
  req: HttpReq,
  res: HttpRes,
  readBody: (req: HttpReq) => Promise<string>,
): Promise<boolean> {
  const path = parsed.pathname
  const method = (req.method ?? 'GET').toUpperCase()
  if (!path.startsWith('/__aria/skills')) return false

  if (path === '/__aria/skills' && method === 'GET') {
    json(res, 200, { ok: true, skills: publicSkills() })
    return true
  }
  if (path === '/__aria/skills/match' && method === 'POST') {
    let text = ''
    try {
      const body = JSON.parse(await readBody(req)) as { text?: string }
      text = typeof body.text === 'string' ? body.text : ''
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON' })
      return true
    }
    json(res, 200, { ok: true, skills: matchSkills(text, 2) })
    return true
  }
  if (path === '/__aria/skills/read' && method === 'POST') {
    let name = ''
    try {
      const body = JSON.parse(await readBody(req)) as { name?: string }
      name = typeof body.name === 'string' ? body.name : ''
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON' })
      return true
    }
    const skill = readSkillBody(name)
    if (!skill) {
      json(res, 404, { ok: false, error: 'Skill not found' })
      return true
    }
    json(res, 200, { ok: true, skill })
    return true
  }
  if (path.startsWith('/__aria/skills/') && method === 'GET') {
    const name = decodeURIComponent(path.slice('/__aria/skills/'.length)).trim()
    const skill = readSkillBody(name)
    if (!skill) {
      json(res, 404, { ok: false, error: 'Skill not found' })
      return true
    }
    json(res, 200, { ok: true, skill })
    return true
  }
  json(res, 404, { ok: false, error: 'Unknown Aria skills route' })
  return true
}
