import type { AgentId, BusinessState, Knowledge, Skill } from '../types'
import { uid } from '../lib/format'
import { FOUNDER } from '../data/founder'

export const CURRICULUM = [
  { q: 'creative agency monthly retainer pricing South Africa', why: 'Level 3 recurring income' },
  { q: 'SaaS invoicing software small business pricing unit economics', why: 'Paidly as a company' },
  { q: 'how to productise a design agency packaging brand system offer', why: 'time → systems → products' },
  { q: 'founder bottleneck delegate production creative director to CEO', why: 'stop being the designer who does everything' },
]

type SearchHit = { title: string; url: string; snippet: string }
type SearchRes = { ok: boolean; query?: string; results?: SearchHit[]; error?: string; engine?: string }
type ReadRes = { ok: boolean; url?: string; title?: string; description?: string; text?: string; error?: string }

export type BrowserHealth = {
  ok: boolean
  google: boolean
  openai: boolean
  cursor: boolean
  code: boolean
  cursorSkills: number
  engine: 'google' | 'fallback' | 'down'
}

async function readJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  const trimmed = text.trim()
  if (!trimmed) throw new Error(`${label} returned an empty body.`)
  if (trimmed[0] !== '{' && trimmed[0] !== '[') {
    const hint = trimmed.slice(0, 72).replace(/\s+/g, ' ')
    throw new Error(
      `${label} returned HTML/text, not JSON (${res.status}: “${hint}”). /__aria only exists while Vite is serving this app at http://127.0.0.1:5173 — not a static or Vercel 404 page.`,
    )
  }
  try {
    return JSON.parse(trimmed) as T
  } catch {
    throw new Error(`${label} sent broken JSON. I will not fake a source.`)
  }
}

export async function browserHealth(): Promise<BrowserHealth> {
  try {
    const res = await fetch('/__aria/health')
    const data = await readJson<{ ok?: boolean; google?: boolean; openai?: boolean; cursor?: boolean; code?: boolean; cursorSkills?: number; engine?: 'google' | 'fallback' }>(res, 'Health')
    return {
      ok: !!data.ok,
      google: !!data.google,
      openai: !!data.openai,
      cursor: !!data.cursor,
      code: data.code !== false,
      cursorSkills: data.cursorSkills ?? 0,
      engine: data.engine ?? (data.google ? 'google' : 'fallback'),
    }
  } catch {
    return { ok: false, google: false, openai: false, cursor: false, code: false, cursorSkills: 0, engine: 'down' }
  }
}

export async function searchWeb(query: string): Promise<SearchHit[]> {
  const res = await fetch(`/__aria/search?q=${encodeURIComponent(query)}`)
  const data = await readJson<SearchRes>(res, 'Search')
  if (!data.ok) throw new Error(data.error || 'Search failed')
  return data.results ?? []
}

export async function readPage(url: string): Promise<{ url: string; title: string; text: string }> {
  const res = await fetch(`/__aria/read?url=${encodeURIComponent(url)}`)
  const data = await readJson<ReadRes>(res, 'Read')
  if (!data.ok && !data.text) throw new Error(data.error || 'Read failed')
  const text = [data.description, data.text].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return { url: data.url || url, title: data.title || url, text }
}

export async function browseWeb(query: string, url?: string): Promise<Knowledge[]> {
  const at = new Date().toISOString()
  if (url) {
    const page = await readPage(url)
    return [toKnowledge(query, page.url, page.title, page.text, at)]
  }
  const hits = await searchWeb(query)
  const top = hits.slice(0, 3)
  const pages = await Promise.allSettled(top.map((h) => readPage(h.url)))
  const learned: Knowledge[] = []
  top.forEach((hit, i) => {
    const page = pages[i]
    const body = page.status === 'fulfilled' ? page.value.text : hit.snippet
    const title = page.status === 'fulfilled' ? page.value.title || hit.title : hit.title
    const href = page.status === 'fulfilled' ? page.value.url : hit.url
    if (!body && !hit.snippet) return
    learned.push(toKnowledge(query, href, title, body || hit.snippet, at))
  })
  if (!learned.length && hits[0]) {
    learned.push(toKnowledge(query, hits[0].url, hits[0].title, hits[0].snippet || hits[0].title, at))
  }
  return learned
}

export function absorbKnowledge(state: BusinessState, items: Knowledge[], query: string): BusinessState {
  const fresh = items.filter((item) => !state.knowledge.some((k) => k.url === item.url))
  let skills = [...state.skills]
  const grown: Skill[] = []
  for (const item of fresh) {
    const keys = keywords(`${query} ${item.title}`).slice(0, 6)
    if (keys.length < 1) continue
    const name = `Web: ${item.title.slice(0, 42)}`
    if (skills.some((s) => s.name === name || s.reply === item.takeaway)) continue
    const skill: Skill = {
      id: uid('sk'),
      name,
      keywords: keys,
      reply: `${item.takeaway} Source: ${item.title}.`,
      agentId: guessAgent(query),
      source: 'web',
      uses: 0,
      createdAt: item.at,
    }
    skills = [skill, ...skills]
    grown.push(skill)
  }
  const activity = fresh.length
    ? [{ id: uid('log'), text: `Aria learned from the web: ${query} · ${fresh.length} page${fresh.length === 1 ? '' : 's'}`, at: new Date().toISOString() }, ...state.activity]
    : state.activity
  return {
    ...state,
    knowledge: [...fresh, ...state.knowledge].slice(0, 40),
    skills,
    lastBrowse: new Date().toISOString(),
    activity,
  }
}

export function nextCurriculum(state: BusinessState) {
  const used = new Set(state.knowledge.map((k) => k.query.toLowerCase()))
  return CURRICULUM.find((c) => !used.has(c.q.toLowerCase())) ?? CURRICULUM[state.knowledge.length % CURRICULUM.length]
}

export function researchReply(query: string, items: Knowledge[]) {
  if (!items.length) {
    return {
      text: `I went looking for “${query}” and came back empty. The browser path is up, but those pages did not give me a clean extract. Ask me a tighter query, or paste a URL.`,
      bullets: [`Aligned to ${FOUNDER.shortName}: I only keep what can help cash, delivery, or assets.`],
    }
  }
  return {
    text: `I went on the web for “${query}”. Here’s what I’m keeping — not a dump, the takeaway I can use for you.`,
    bullets: items.slice(0, 4).map((k) => `${k.title} — ${k.takeaway}`),
  }
}

function toKnowledge(query: string, url: string, title: string, text: string, at: string): Knowledge {
  const takeaway = summarise(text)
  return {
    id: uid('kn'),
    query,
    url,
    title: title || query,
    excerpt: text.slice(0, 420),
    takeaway,
    at,
    source: url.startsWith('http') ? 'page' : 'search',
  }
}

function summarise(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40 && s.length < 280)
  const pick = (sentences[0] ? sentences.slice(0, 2) : [clean.slice(0, 220)]).join(' ')
  return pick.slice(0, 360)
}

function keywords(text: string) {
  const stop = new Set(['the', 'a', 'an', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'with', 'your', 'you', 'me', 'i', 'it', 'this', 'that', 'aria', 'learn', 'about', 'research', 'from', 'what', 'how'])
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w))
}

function guessAgent(text: string): AgentId {
  const t = text.toLowerCase()
  if (/invoice|pay|cash|saas|mrr|churn|price/.test(t)) return 'finance'
  if (/client|retain/.test(t)) return 'client'
  if (/brand|design|packag|creative/.test(t)) return 'creative'
  if (/market|lead|campaign/.test(t)) return 'marketing'
  return 'ceo'
}
