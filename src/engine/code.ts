export type CodeFile = { path: string; excerpt: string }
export type CodeHit = { path: string; line: number; text: string }
export type CodePack = {
  question: string
  map: string[]
  files: CodeFile[]
  hits: CodeHit[]
}

const FILEISH =
  /\b((?:src|plugins|public|\.cursor)\/[\w./-]+|[\w.-]+\.(?:ts|tsx|js|jsx|mjs|css|md)|vite\.config|package\.json|tsconfig|__aria)\b/i

export function isCodeAsk(t: string) {
  if (FILEISH.test(t)) return true
  if (/\b(explain|read|show|open|where is|how does|how do|walk me through)\b/.test(t) && /\b(code|file|function|component|hook|plugin|endpoint|typecheck|repo|codebase|typescript)\b/.test(t)) {
    return true
  }
  if (/\b(typeerror|compile error|stack trace|linter|ts\d{4})\b/.test(t)) return true
  if (/\b(write|fix|implement|refactor|patch)\b.{0,50}\b(code|file|function|component|bug|handler|endpoint)\b/.test(t)) return true
  return false
}

export function wantsCodeChange(t: string) {
  return /\b(fix|implement|refactor|patch|typecheck|write (the )?(code|function|component|handler)|add (a |the )?(function|handler|endpoint|route|file)|make it (compile|typecheck)|ship (this|that) (fix|patch|change))\b/.test(t)
}

export async function fetchCodeContext(question: string): Promise<CodePack | null> {
  try {
    const res = await fetch('/__aria/code/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.slice(0, 500) }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<CodePack> & { ok?: boolean }
    if (!data.ok) return null
    return {
      question: data.question || question,
      map: Array.isArray(data.map) ? data.map.map(String).slice(0, 80) : [],
      files: Array.isArray(data.files)
        ? data.files
            .filter((f): f is CodeFile => Boolean(f && typeof f === 'object' && 'path' in f && 'excerpt' in f))
            .slice(0, 6)
            .map((f) => ({ path: String(f.path), excerpt: String(f.excerpt).slice(0, 4500) }))
        : [],
      hits: Array.isArray(data.hits)
        ? data.hits.slice(0, 16).map((h) => ({
            path: String((h as CodeHit).path ?? ''),
            line: Number((h as CodeHit).line) || 0,
            text: String((h as CodeHit).text ?? '').slice(0, 180),
          }))
        : [],
    }
  } catch {
    return null
  }
}

export function localCodeBrief(pack: CodePack | null, question: string): { text: string; bullets: string[] } {
  if (!pack || (!pack.files.length && !pack.hits.length)) {
    return {
      text: `I looked in this repo for “${question.slice(0, 80)}” and didn’t land a file. Name a path (src/engine/brain.ts) or a symbol and I’ll retrieve it. I will not invent the source.`,
      bullets: pack?.map.slice(0, 6) ?? [],
    }
  }
  const files = pack.files.map((f) => f.path)
  const hits = pack.hits.slice(0, 4).map((h) => `${h.path}:${h.line} ${h.text}`)
  return {
    text: `Retrieved ${pack.files.length} file${pack.files.length === 1 ? '' : 's'} from this repo. I answer from those excerpts — not from a vibe. Ask me to fix it and I’ll ship a bounded Cursor job with the same context.`,
    bullets: [...files, ...hits].slice(0, 6),
  }
}
