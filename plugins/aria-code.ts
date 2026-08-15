import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'

type HttpReq = {
  method?: string
  on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void
}
type HttpRes = { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }

const ROOT = resolve(process.cwd())
const ALLOW_DIRS = new Set(['src', 'plugins', 'public', '.cursor'])
const ROOT_FILES = new Set(['vite.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'index.html', 'README.md'])
const ALLOW_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json', '.md', '.html', '.svg'])
const BLOCK_DIR = new Set(['node_modules', '.git', 'dist', '.aria', 'coverage', 'agent-transcripts', 'terminals'])
const BLOCK_FILE = /\.(env|pem|key|p12)$|^\.env|credentials|secret|id_rsa/i
const STOP = new Set([
  'the', 'a', 'an', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'with', 'your', 'you', 'me', 'i', 'it',
  'this', 'that', 'how', 'does', 'do', 'what', 'where', 'why', 'when', 'is', 'are', 'be', 'can', 'please',
  'show', 'read', 'explain', 'file', 'code', 'function', 'the', 'work', 'works', 'aria', 'mando',
])

const MAX_FILE_BYTES = 180_000
const MAX_EXCERPT = 4_500
const MAX_CONTEXT_CHARS = 18_000
const MAX_HITS = 36

export type CodeFile = { path: string; excerpt: string }
export type CodeHit = { path: string; line: number; text: string }
export type CodePack = {
  question: string
  map: string[]
  files: CodeFile[]
  hits: CodeHit[]
}

function json(res: HttpRes, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function underRoot(abs: string) {
  return abs === ROOT || abs.startsWith(ROOT + sep)
}

function safeAbs(raw: string): string | null {
  const trimmed = raw.replace(/\\/g, '/').replace(/^\/+/, '').trim()
  if (!trimmed || trimmed.includes('\0') || trimmed.includes('..')) return null
  const abs = resolve(ROOT, trimmed)
  if (!underRoot(abs)) return null
  const rel = relative(ROOT, abs).replace(/\\/g, '/')
  const top = rel.split('/')[0] ?? rel
  if (BLOCK_DIR.has(top)) return null
  if (BLOCK_FILE.test(rel) || BLOCK_FILE.test(trimmed)) return null
  const allowedTop = ALLOW_DIRS.has(top) || ROOT_FILES.has(rel)
  if (!allowedTop) return null
  return abs
}

function listFiles(dir: string, acc: string[], depth = 0) {
  if (depth > 8 || acc.length > 800) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.') && name !== '.cursor') continue
    if (BLOCK_DIR.has(name) || BLOCK_FILE.test(name)) continue
    const abs = resolve(dir, name)
    let st
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      const rel = relative(ROOT, abs).replace(/\\/g, '/')
      const top = rel.split('/')[0]
      if (depth === 0 && !ALLOW_DIRS.has(name) && !ALLOW_DIRS.has(top)) continue
      listFiles(abs, acc, depth + 1)
      continue
    }
    if (!ALLOW_EXT.has(extname(name).toLowerCase())) continue
    if (st.size > MAX_FILE_BYTES) continue
    acc.push(relative(ROOT, abs).replace(/\\/g, '/'))
  }
}

function mapRepo(): string[] {
  const files: string[] = []
  for (const name of ROOT_FILES) {
    if (existsSync(resolve(ROOT, name))) files.push(name)
  }
  listFiles(ROOT, files)
  return [...new Set(files)].sort()
}

function readRel(rel: string, maxChars = MAX_EXCERPT * 2): { path: string; text: string } | null {
  const abs = safeAbs(rel)
  if (!abs || !existsSync(abs)) return null
  try {
    const st = statSync(abs)
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null
    const text = readFileSync(abs, 'utf8').slice(0, maxChars)
    return { path: relative(ROOT, abs).replace(/\\/g, '/'), text }
  } catch {
    return null
  }
}

function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .slice(0, 10)
}

function pathHints(q: string): string[] {
  const hits: string[] = []
  const re = /\b((?:src|plugins|public|\.cursor)\/[\w./-]+|[\w.-]+\.(?:ts|tsx|js|jsx|mjs|css|md|json)|vite\.config\.ts|package\.json|tsconfig[\w.]*\.json)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(q))) hits.push(m[1].replace(/\\/g, '/'))
  return [...new Set(hits)]
}

function excerptAround(text: string, needle: string, radius = 18): string {
  const lines = text.split('\n')
  const low = needle.toLowerCase()
  let idx = lines.findIndex((l) => l.toLowerCase().includes(low))
  if (idx < 0) idx = 0
  const from = Math.max(0, idx - 4)
  const to = Math.min(lines.length, idx + radius)
  const slice = lines.slice(from, to).join('\n')
  return slice.slice(0, MAX_EXCERPT)
}

function searchRepo(query: string): CodeHit[] {
  const words = tokens(query)
  if (!words.length) return []
  const files = mapRepo()
  const hits: CodeHit[] = []
  for (const rel of files) {
    const file = readRel(rel, MAX_FILE_BYTES)
    if (!file) continue
    const lines = file.text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const low = line.toLowerCase()
      if (!words.some((w) => low.includes(w))) continue
      hits.push({ path: file.path, line: i + 1, text: line.trim().slice(0, 180) })
      if (hits.length >= MAX_HITS) return hits
    }
  }
  return hits
}

export function buildCodePack(question: string): CodePack {
  const q = question.trim().slice(0, 500)
  const map = mapRepo()
  const hints = pathHints(q)
  const words = tokens(q)
  const hits = words.length ? searchRepo(q) : []
  const score = new Map<string, number>()
  const bump = (path: string, n: number) => score.set(path, (score.get(path) ?? 0) + n)

  for (const hint of hints) {
    const exact = map.find((f) => f === hint || f.endsWith('/' + hint) || f.endsWith(hint))
    if (exact) bump(exact, 20)
    else {
      const fuzzy = map.filter((f) => f.toLowerCase().includes(hint.toLowerCase())).slice(0, 4)
      for (const f of fuzzy) bump(f, 12)
    }
  }
  for (const hit of hits) bump(hit.path, 2)
  for (const rel of map) {
    const base = rel.split('/').pop()?.toLowerCase() ?? ''
    if (words.some((w) => base.includes(w))) bump(rel, 8)
  }

  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
  const chosen = [...new Set([...hints.map((h) => map.find((f) => f.endsWith(h) || f === h)).filter(Boolean) as string[], ...ranked])].slice(0, 6)

  const files: CodeFile[] = []
  let used = 0
  for (const path of chosen) {
    const file = readRel(path, 24_000)
    if (!file) continue
    const needle = words[0] || hints[0] || ''
    const excerpt = excerptAround(file.text, needle)
    if (!excerpt.trim()) continue
    if (used + excerpt.length > MAX_CONTEXT_CHARS) break
    files.push({ path: file.path, excerpt })
    used += excerpt.length
  }

  return {
    question: q,
    map: map.slice(0, 80),
    files,
    hits: hits.slice(0, 16),
  }
}

export async function handleCodeRequest(
  parsed: URL,
  req: HttpReq,
  res: HttpRes,
  readBody: (req: HttpReq) => Promise<string>,
): Promise<boolean> {
  const path = parsed.pathname
  const method = (req.method ?? 'GET').toUpperCase()
  if (!path.startsWith('/__aria/code')) return false

  if (path === '/__aria/code' && method === 'GET') {
    json(res, 200, { ok: true, root: ROOT, files: mapRepo().length })
    return true
  }
  if (path === '/__aria/code/map' && method === 'GET') {
    json(res, 200, { ok: true, root: 'business-ai', files: mapRepo() })
    return true
  }
  if (path === '/__aria/code/read' && method === 'GET') {
    const rel = parsed.searchParams.get('path')?.trim() ?? ''
    const file = readRel(rel, 40_000)
    if (!file) {
      json(res, 404, { ok: false, error: 'File not found or blocked' })
      return true
    }
    json(res, 200, { ok: true, path: file.path, text: file.text })
    return true
  }
  if (path === '/__aria/code/search' && method === 'GET') {
    const q = parsed.searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) {
      json(res, 400, { ok: false, error: 'Query too short' })
      return true
    }
    json(res, 200, { ok: true, query: q, hits: searchRepo(q) })
    return true
  }
  if (path === '/__aria/code/context' && method === 'POST') {
    let question = ''
    try {
      const body = JSON.parse(await readBody(req)) as { question?: string; text?: string }
      question = (typeof body.question === 'string' ? body.question : body.text ?? '').trim()
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON' })
      return true
    }
    if (question.length < 2) {
      json(res, 400, { ok: false, error: 'Missing question' })
      return true
    }
    json(res, 200, { ok: true, ...buildCodePack(question) })
    return true
  }
  json(res, 404, { ok: false, error: 'Unknown Aria code route' })
  return true
}
