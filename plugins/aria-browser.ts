import { loadEnv, type Plugin } from 'vite'
import { PROTOCOL_GPT } from '../src/data/protocol.js'
import { handleSkillsRequest, INVESTIGATE_RULE, skillCount } from './aria-skills.js'
import { handleCodeRequest } from './aria-code.js'
import { handleEngineerRequest } from './aria-engineer.js'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Aria/1.0'

const MAX_BYTES = 700_000
const TIMEOUT_MS = 12_000

type SearchHit = { title: string; url: string; snippet: string }
type GoogleCreds = { key: string; cx: string }

function envBag() {
  return loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', process.cwd(), '')
}

function creds(): GoogleCreds {
  const env = envBag()
  return {
    key: (env.GOOGLE_CSE_API_KEY || env.GOOGLE_API_KEY || process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_API_KEY || '').trim(),
    cx: (env.GOOGLE_CSE_CX || env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX || process.env.GOOGLE_CSE_ID || '').trim(),
  }
}

function openaiKey() {
  const env = envBag()
  return (env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim()
}

function cursorKey() {
  const env = envBag()
  return (env.CURSOR_API_KEY || process.env.CURSOR_API_KEY || '').trim()
}

function scrub(s: string) {
  return s.replace(/sk-[a-zA-Z0-9_\-]+/g, '[redacted]').replace(/key_[a-zA-Z0-9]+/g, '[redacted]')
}

const THINK_MAX = 80_000
const GPT_TIMEOUT_MS = 20_000
const PLAN_TIMEOUT_MS = 45_000

function readBody(req: { on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void }, max = THINK_MAX) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (arg) => {
      const buf = Buffer.isBuffer(arg) ? arg : Buffer.from(String(arg ?? ''))
      size += buf.length
      if (size > max) {
        reject(new Error('Payload too large'))
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', (err) => reject(err instanceof Error ? err : new Error('Read failed')))
  })
}

type ThinkOut = { text: string; bullets?: string[]; agentId?: string }
type PlanOut = {
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

async function openaiSpeak(text: string): Promise<{ buf: Buffer; type: string }> {
  const key = openaiKey()
  if (!key) throw new Error('OpenAI is not configured')
  const spoken = text.slice(0, 900)
      const attempts: Array<Record<string, unknown>> = [
    {
      model: 'gpt-4o-mini-tts',
      voice: 'nova',
      input: spoken,
      response_format: 'mp3',
      instructions:
        'You are Aria, Mando’s executive assistant. Calm, direct, not chirpy. No filler. Conversational pace. No theatrics.',
    },
    { model: 'tts-1', voice: 'nova', input: spoken, response_format: 'mp3' },
  ]
  let last = 'TTS failed'
  for (const body of attempts) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8_000)
    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        last = res.status === 401 || res.status === 403 ? 'OpenAI auth failed' : `OpenAI ${res.status}`
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 80) continue
      return { buf, type: res.headers.get('content-type') || 'audio/mpeg' }
    } catch (err) {
      last = err instanceof Error ? err.message : 'TTS failed'
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(last)
}

async function openaiChat(payload: {
  text: string
  intent: string
  snapshot: unknown
  research?: unknown
  skill?: { name?: string; body?: string }
  voice?: boolean
  code?: unknown
}): Promise<ThinkOut> {
  const key = openaiKey()
  if (!key) throw new Error('OpenAI is not configured')
  const extra =
    payload.intent === 'build'
      ? 'The note is already on the build list. Compile it into a concrete next step this OS can ship.'
      : payload.intent === 'research'
        ? 'Synthesize only from the research items. Do not invent sources.'
        : payload.intent === 'code' || payload.code
          ? 'You retrieved real files from this repo (code pack). Explain from those excerpts. Cite paths. If a file is missing, say so. Do not invent source. Small quotes only — not a dump. If Mando wants a change, say you will ship it through Cursor.'
          : 'Answer from the live snapshot. Empty ledger means empty — do not invent invoices, studio clients, or Paidly homepage mock numbers (Highveld, Brightleaf).'
  const skillBlock = payload.skill?.body
    ? `Follow the attached Cursor skill “${payload.skill.name ?? 'skill'}” as instructions. Investigate, retrieve, calculate, compare. Do not dump a canned one-liner.`
    : 'If a better answer needs investigation, do not simply answer.'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), GPT_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: payload.voice ? 280 : payload.code ? 900 : payload.skill?.body ? 700 : 500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are Aria, coding agent and COO for Armando Mavelele (Mando) of BrandCafé and Paidly (South Africa, ZAR). Cursor is how you type. Mando merges. ' +
              `${PROTOCOL_GPT} ` +
              'Put Mando first: cash, then commitments, then revenue, then assets. Ultimate operating goal: R0 → R1,000,000 verified ZAR collected (paid invoices / Paidly receipts — not valuation, not homepage mock numbers). Empty ledger is R0. ' +
              `${INVESTIGATE_RULE} ` +
              'When deciding: Assessment, Analysis, Recommendation (PURSUE/TEST/WAIT/REJECT), Risk, Next Action. ' +
              `${skillBlock} ` +
              extra +
              (payload.voice
                ? ' Mando is speaking out loud. Reply as conversation: 2-4 short sentences, no markdown, no filler. Put lists in bullets. Address the matter immediately.'
                : '') +
              ' Reply JSON only: {"text":"2-6 sentences","bullets":["short"],"agentId":"ceo"|"finance"|"client"|"project"|"marketing"|"creative"}. ' +
              'Max 6 bullets.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              user: String(payload.text).slice(0, 4000),
              intent: payload.intent,
              studio: payload.snapshot,
              research: payload.research,
              code: payload.code ?? undefined,
              skill: payload.skill?.name
                ? { name: payload.skill.name, body: String(payload.skill.body ?? '').slice(0, 12_000) }
                : undefined,
            }),
          },
        ],
      }),
    })
    const raw = await res.text()
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'OpenAI auth failed' : `OpenAI ${res.status}`)
    const data = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as ThinkOut
    if (!parsed.text?.trim()) throw new Error('Empty model reply')
    return {
      text: parsed.text.trim(),
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map(String).slice(0, 6) : undefined,
      agentId: typeof parsed.agentId === 'string' ? parsed.agentId : undefined,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function openaiPlan(payload: {
  task: string
  title: string
  product?: string
  snapshot: unknown
  workspaces?: unknown
  code?: unknown
}): Promise<PlanOut> {
  const key = openaiKey()
  if (!key) throw new Error('OpenAI is not configured. Add OPENAI_API_KEY to .env and restart Vite.')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PLAN_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 1100,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are Aria, the coding agent, planning a SINGLE implementation brief for Armando “Mando” Mavelele. Cursor is how you type. Use the retrieved code pack when present — real paths, not guesses. You do not write the full patch here. ' +
              'Mando merges. Direct, no filler. If the job is weak, reject it. ' +
              'Mando-first: cash, commitments, then assets. Ultimate goal R0 → R1 million verified collected. Reject vanity, fake invoices, demo studio restore (Meridian/Atlas), random widgets, Paidly marketing numbers treated as books, and work that does not collect, retain, or compound cash toward that number. ' +
              'This repo is business-ai (Aria OS). Sibling Paidly/BrandCafé folders only if listed in workspaces. ' +
              'If the job does not help Mando’s cash, delivery, live products, or the R1m scoreboard, set reject=true. ' +
              'Reply JSON only: {"title":"","why":"why this helps Mando","files":["src/..."],"scope":"what to change and what not to touch","doneWhen":"","prompt":"full instructions for Cursor Agent.create","target":"aria"|"paidly"|"brandcafe","reject":false,"rejectReason":""}. ' +
              'prompt must be a tight implementation brief Cursor can execute: files, constraints, done-when. Do not commit .env. Do not invent clients.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: payload.task.slice(0, 4000),
              title: payload.title.slice(0, 160),
              product: payload.product ?? 'aria',
              studio: payload.snapshot,
              workspaces: payload.workspaces ?? {},
              code: payload.code ?? undefined,
            }),
          },
        ],
      }),
    })
    const raw = await res.text()
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'OpenAI auth failed' : `OpenAI ${res.status}`)
    const data = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as Partial<PlanOut>
    const target = parsed.target === 'paidly' || parsed.target === 'brandcafe' ? parsed.target : 'aria'
    const title = String(parsed.title || payload.title).trim().slice(0, 120)
    const why = String(parsed.why || '').trim()
    const prompt = String(parsed.prompt || '').trim()
    const reject = Boolean(parsed.reject)
    if (!reject && prompt.length < 40) throw new Error('Empty implementation brief')
    return {
      title,
      why: why.slice(0, 400),
      files: Array.isArray(parsed.files) ? parsed.files.map(String).slice(0, 12) : [],
      scope: String(parsed.scope || '').slice(0, 500),
      doneWhen: String(parsed.doneWhen || '').slice(0, 280),
      prompt: prompt.slice(0, 12_000),
      target,
      reject,
      rejectReason: parsed.rejectReason ? String(parsed.rejectReason).slice(0, 280) : undefined,
    }
  } finally {
    clearTimeout(timer)
  }
}

function json(res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function decode(html: string) {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function stripHtml(html: string) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function extractPage(html: string) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '')
  const desc = decode(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]
      ?? '',
  )
  const text = stripHtml(html).slice(0, 9000)
  return { title: title.slice(0, 180), description: desc.slice(0, 400), text }
}

function isBlockedHost(hostname: string) {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h === '0.0.0.0' || h === '::1') return true
  if (/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (h.endsWith('.internal') || h.endsWith('.localhost')) return true
  return false
}

function safeUrl(raw: string) {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (isBlockedHost(parsed.hostname)) return null
  return parsed
}

async function fetchText(url: string) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
    })
    const buf = await res.arrayBuffer()
    const slice = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf
    const text = new TextDecoder('utf-8').decode(slice)
    return { ok: res.ok, status: res.status, finalUrl: res.url, text }
  } finally {
    clearTimeout(timer)
  }
}

async function wikipedia(query: string): Promise<SearchHit[]> {
  try {
    const api = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=5`
    const { text, ok } = await fetchText(api)
    if (!ok) return []
    if (!text.trim().startsWith('{')) return []
    const data = JSON.parse(text) as { query?: { search?: { title: string; snippet: string }[] } }
    return (data.query?.search ?? []).map((row) => ({
      title: row.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, '_'))}`,
      snippet: stripHtml(row.snippet),
    }))
  } catch {
    return []
  }
}

async function duckInstant(query: string): Promise<SearchHit[]> {
  try {
    const api = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const { text, ok } = await fetchText(api)
    if (!ok) return []
    if (!text.trim().startsWith('{')) return []
    const data = JSON.parse(text) as {
      AbstractText?: string
      AbstractURL?: string
      Heading?: string
      RelatedTopics?: { Text?: string; FirstURL?: string }[]
    }
    const hits: SearchHit[] = []
    if (data.AbstractURL && (data.AbstractText || data.Heading)) {
      hits.push({
        title: data.Heading || data.AbstractURL,
        url: data.AbstractURL,
        snippet: data.AbstractText || '',
      })
    }
    for (const t of data.RelatedTopics ?? []) {
      if (t.FirstURL && t.Text) hits.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text })
    }
    return hits.slice(0, 6)
  } catch {
    return []
  }
}

async function duckHtml(query: string): Promise<SearchHit[]> {
  try {
    const api = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const { text, ok } = await fetchText(api)
    if (!ok) return []
    const hits: SearchHit[] = []
    const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      let href = decode(m[1])
      const title = stripHtml(m[2])
      const uddg = href.match(/uddg=([^&]+)/)
      if (uddg) href = decodeURIComponent(uddg[1])
      if (!safeUrl(href) || !title) continue
      hits.push({ title, url: href, snippet: '' })
      if (hits.length >= 6) break
    }
    return hits
  } catch {
    return []
  }
}

async function googleSearch(query: string, auth: GoogleCreds): Promise<SearchHit[]> {
  if (!auth.key || !auth.cx) return []
  try {
    const api = new URL('https://www.googleapis.com/customsearch/v1')
    api.searchParams.set('key', auth.key)
    api.searchParams.set('cx', auth.cx)
    api.searchParams.set('q', query)
    api.searchParams.set('num', '8')
    api.searchParams.set('gl', 'za')
    api.searchParams.set('hl', 'en')
    api.searchParams.set('safe', 'off')
    const { text, ok } = await fetchText(api.toString())
    if (!text.trim().startsWith('{')) return []
    const data = JSON.parse(text) as {
      error?: { message?: string }
      items?: { title?: string; link?: string; snippet?: string }[]
    }
    if (!ok || data.error) return []
    return (data.items ?? [])
      .filter((row) => row.link && row.title)
      .map((row) => ({
        title: row.title ?? '',
        url: row.link ?? '',
        snippet: row.snippet ?? '',
      }))
  } catch {
    return []
  }
}

async function searchWeb(query: string) {
  const auth = creds()
  const google = await googleSearch(query, auth)
  if (google.length) return { results: google.slice(0, 8), engine: 'google' as const }

  const packs = await Promise.allSettled([duckInstant(query), wikipedia(query), duckHtml(query)])
  const seen = new Set<string>()
  const results: SearchHit[] = []
  for (const pack of packs) {
    if (pack.status !== 'fulfilled') continue
    for (const hit of pack.value) {
      const key = hit.url.replace(/\/$/, '')
      if (seen.has(key) || !safeUrl(hit.url)) continue
      seen.add(key)
      results.push(hit)
    }
  }
  return { results: results.slice(0, 8), engine: 'fallback' as const }
}

type AriaReq = { url?: string; method?: string; originalUrl?: string; on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void }
type AriaRes = { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }

export async function handleBrowserRequest(url: string, req: AriaReq, res: AriaRes): Promise<void> {
  try {
    const parsed = new URL(url, 'http://aria.local')
        if (await handleSkillsRequest(parsed, req as { method?: string; on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void }, res, readBody)) {
          return
        }
        if (await handleEngineerRequest(parsed, req as { method?: string; on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void }, res, readBody)) {
          return
        }
        if (await handleCodeRequest(parsed, req as { method?: string; on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void }, res, readBody)) {
          return
        }
        if (parsed.pathname === '/__aria/health') {
          const auth = creds()
          json(res, 200, {
            ok: true,
            browser: 'live',
            google: Boolean(auth.key && auth.cx),
            openai: Boolean(openaiKey()),
            tts: Boolean(openaiKey()),
            cursor: Boolean(cursorKey()),
            code: true,
            cursorSkills: skillCount(),
            engine: auth.key && auth.cx ? 'google' : 'fallback',
          })
          return
        }
        if (parsed.pathname === '/__aria/search') {
          const q = parsed.searchParams.get('q')?.trim() ?? ''
          if (q.length < 2) {
            json(res, 400, { ok: false, error: 'Query too short' })
            return
          }
          const { results, engine } = await searchWeb(q)
          json(res, 200, { ok: true, query: q, engine, results })
          return
        }
        if (parsed.pathname === '/__aria/read') {
          const raw = parsed.searchParams.get('url')?.trim() ?? ''
          const target = safeUrl(raw)
          if (!target) {
            json(res, 400, { ok: false, error: 'Blocked or invalid URL' })
            return
          }
          const page = await fetchText(target.toString())
          const extracted = extractPage(page.text)
          json(res, 200, {
            ok: page.ok,
            url: page.finalUrl || target.toString(),
            title: extracted.title,
            description: extracted.description,
            text: extracted.text,
          })
          return
        }
        if (parsed.pathname === '/__aria/think') {
          if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
            json(res, 405, { ok: false, error: 'POST only' })
            return
          }
          if (!openaiKey()) {
            json(res, 503, { ok: false, error: 'OpenAI is not configured' })
            return
          }
          const body = JSON.parse(await readBody(req as { on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void })) as {
            text?: string
            intent?: string
            snapshot?: unknown
            research?: unknown
            skill?: { name?: string; body?: string }
            title?: string
            product?: string
            workspaces?: unknown
            task?: string
            voice?: boolean
            code?: unknown
          }
          const intent = typeof body.intent === 'string' ? body.intent : 'fallback'
          if (intent === 'plan') {
            const task = (typeof body.task === 'string' ? body.task : body.text ?? '').trim()
            if (task.length < 4) {
              json(res, 400, { ok: false, error: 'Missing task' })
              return
            }
            const brief = await openaiPlan({
              task,
              title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : task.slice(0, 88),
              product: body.product,
              snapshot: body.snapshot ?? {},
              workspaces: body.workspaces,
              code: body.code,
            })
            json(res, 200, {
              ok: true,
              text: brief.reject
                ? brief.rejectReason || 'GPT rejected this as vanity work.'
                : brief.why || `Brief ready: ${brief.title}`,
              bullets: [
                brief.scope,
                brief.doneWhen ? `Done when: ${brief.doneWhen}` : '',
                ...brief.files.slice(0, 4),
              ].filter(Boolean).slice(0, 6),
              brief,
            })
            return
          }
          const text = typeof body.text === 'string' ? body.text.trim() : ''
          if (text.length < 1) {
            json(res, 400, { ok: false, error: 'Missing text' })
            return
          }
          const out = await openaiChat({
            text,
            intent,
            snapshot: body.snapshot ?? {},
            research: body.research,
            skill: body.skill,
            voice: Boolean(body.voice),
            code: body.code,
          })
          json(res, 200, { ok: true, ...out })
          return
        }
        if (parsed.pathname === '/__aria/speak') {
          if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
            json(res, 405, { ok: false, error: 'POST only' })
            return
          }
          if (!openaiKey()) {
            json(res, 503, { ok: false, error: 'OpenAI is not configured' })
            return
          }
          const body = JSON.parse(await readBody(req as { on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void })) as { text?: string }
          const text = typeof body.text === 'string' ? body.text.trim() : ''
          if (text.length < 1) {
            json(res, 400, { ok: false, error: 'Missing text' })
            return
          }
          const spoken = await openaiSpeak(text)
          res.statusCode = 200
          res.setHeader('Content-Type', spoken.type)
          res.setHeader('Cache-Control', 'no-store')
          ;(res as unknown as { end: (b: Buffer) => void }).end(spoken.buf)
          return
        }
        if (parsed.pathname === '/__aria/plan') {
          if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
            json(res, 405, { ok: false, error: 'POST only' })
            return
          }
          if (!openaiKey()) {
            json(res, 503, { ok: false, error: 'OpenAI is not configured. Add OPENAI_API_KEY to .env (server only) and restart Vite.' })
            return
          }
          const body = JSON.parse(await readBody(req as { on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void })) as {
            task?: string
            title?: string
            product?: string
            snapshot?: unknown
            workspaces?: unknown
            code?: unknown
          }
          const task = typeof body.task === 'string' ? body.task.trim() : ''
          if (task.length < 4) {
            json(res, 400, { ok: false, error: 'Missing task' })
            return
          }
          const brief = await openaiPlan({
            task,
            title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : task.slice(0, 88),
            product: body.product,
            snapshot: body.snapshot ?? {},
            workspaces: body.workspaces,
            code: body.code,
          })
          json(res, 200, { ok: true, brief })
          return
        }
        json(res, 404, { ok: false, error: 'Unknown Aria browser route' })
      } catch (err) {
        json(res, 502, { ok: false, error: scrub(err instanceof Error ? err.message : 'Browse failed') })
      }
}

function attach(server: { middlewares: { use: (fn: (req: { url?: string; method?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }, next: () => void) => void) => void } }) {
  server.middlewares.use((req, res, next) => {
    const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? ''
    if (!url.startsWith('/__aria/')) return next()
    if (url.startsWith('/__aria/cursor')) return next()
    void handleBrowserRequest(url, req as AriaReq, res)
  })
}

export function ariaBrowser(): Plugin {
  return {
    name: 'aria-browser',
    configureServer(server) {
      attach(server)
    },
    configurePreviewServer(server) {
      attach(server)
    },
  }
}
