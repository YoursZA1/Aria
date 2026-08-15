import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { loadEnv, type Plugin } from 'vite'

const MAX_PROMPT = 24_000
const MAX_RUN_MS = 8 * 60_000
const MODEL = 'composer-2.5'

export type CursorProduct = 'aria' | 'paidly' | 'brandcafe'
export type CursorSource = 'chat' | 'autopilot' | 'kernel'
export type CursorRunStatus = 'idle' | 'queued' | 'running' | 'finished' | 'error' | 'cancelled'

export type CursorSnapshot = {
  id: string
  agentId?: string
  runId?: string
  status: CursorRunStatus
  product: CursorProduct
  title: string
  promptPreview: string
  cwd: string
  source: CursorSource
  startedAt?: string
  finishedAt?: string
  summary?: string
  liveText?: string
  error?: string
}

type Workspaces = { aria: string; paidly?: string; brandcafe?: string }

type Active = {
  snapshot: CursorSnapshot
  cancel: () => Promise<void>
}

let active: Active | null = null
const history: CursorSnapshot[] = []

function env() {
  const loaded = loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', process.cwd(), '')
  return {
    apiKey: (loaded.CURSOR_API_KEY || process.env.CURSOR_API_KEY || '').trim(),
    paidly: (loaded.ARIA_PAIDLY_CWD || process.env.ARIA_PAIDLY_CWD || '').trim(),
    brandcafe: (loaded.ARIA_BRANDCAFE_CWD || process.env.ARIA_BRANDCAFE_CWD || '').trim(),
  }
}

function looksLikeRepo(dir: string) {
  if (!dir || !existsSync(dir)) return false
  return existsSync(join(dir, 'package.json')) || existsSync(join(dir, '.git')) || existsSync(join(dir, 'pyproject.toml'))
}

function discoverWorkspaces(): Workspaces {
  const aria = resolve(process.cwd())
  const parent = dirname(aria)
  const { paidly: paidlyEnv, brandcafe: cafeEnv } = env()
  const paidlyHit = [
    paidlyEnv,
    join(parent, 'paidly'),
    join(parent, 'Paidly'),
    join(parent, 'paidly-web'),
    join(parent, 'paidly-app'),
  ].find((p) => p && looksLikeRepo(p))
  const cafeHit = [
    cafeEnv,
    join(parent, 'brand-cafe'),
    join(parent, 'brandcafe'),
    join(parent, 'BrandCafe'),
    join(parent, 'BrandCafé'),
  ].find((p) => p && looksLikeRepo(p))
  return {
    aria,
    paidly: paidlyHit ? resolve(paidlyHit) : undefined,
    brandcafe: cafeHit ? resolve(cafeHit) : undefined,
  }
}

function cwdFor(product: CursorProduct, spaces: Workspaces) {
  if (product === 'paidly' && spaces.paidly) return spaces.paidly
  if (product === 'brandcafe' && spaces.brandcafe) return spaces.brandcafe
  return spaces.aria
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function publicStatus() {
  return {
    ok: true,
    configured: Boolean(env().apiKey),
    model: MODEL,
    workspaces: discoverWorkspaces(),
    running: active?.snapshot.status === 'running' || active?.snapshot.status === 'queued',
    current: active?.snapshot ?? history[0] ?? null,
    history: history.slice(0, 8),
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_PROMPT + 8_000) {
        reject(new Error('Prompt too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function persist(snap: CursorSnapshot) {
  try {
    const dir = join(process.cwd(), '.aria')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'cursor-state.json'),
      JSON.stringify(
        {
          id: snap.id,
          agentId: snap.agentId,
          runId: snap.runId,
          status: snap.status,
          product: snap.product,
          title: snap.title,
          cwd: snap.cwd,
          source: snap.source,
          startedAt: snap.startedAt,
          finishedAt: snap.finishedAt,
        },
        null,
        2,
      ),
    )
  } catch {
    /* ignore disk errors — in-memory status still works */
  }
}

async function startRun(body: {
  prompt?: string
  title?: string
  product?: CursorProduct
  source?: CursorSource
}) {
  if (active && (active.snapshot.status === 'running' || active.snapshot.status === 'queued')) {
    return { status: 409 as const, data: { ok: false, error: 'A Cursor run is already in flight. Stop it first.', current: active.snapshot } }
  }
  const apiKey = env().apiKey
  if (!apiKey) {
    return {
      status: 503 as const,
      data: {
        ok: false,
        error: 'CURSOR_API_KEY is missing. Add it to .env (Cursor Dashboard → Integrations) and restart Vite. The key stays on the server.',
      },
    }
  }
  const prompt = (body.prompt ?? '').trim()
  if (prompt.length < 8) {
    return { status: 400 as const, data: { ok: false, error: 'Prompt too short' } }
  }
  const product: CursorProduct = body.product === 'paidly' || body.product === 'brandcafe' ? body.product : 'aria'
  const source: CursorSource = body.source === 'autopilot' || body.source === 'kernel' ? body.source : 'chat'
  const spaces = discoverWorkspaces()
  const cwd = cwdFor(product, spaces)
  const title = (body.title ?? 'Aria Cursor task').slice(0, 120)
  const id = `cr_${Date.now().toString(36)}`
  const header = [
    `[Aria Cursor bridge]`,
    `Workspace: ${cwd}`,
    `Product: ${product}`,
    `Source: ${source}`,
    product !== 'aria' && !spaces[product] ? `No sibling ${product} repo on disk — stay in THIS workspace. Do not invent a new codebase.` : '',
    `You are Aria, the coding agent. Cursor is how you type. Mando merges.`,
    `Level 2 only unless Mando approved Level 3: branch aria/improve-*, bounded patch, tests, lint, typecheck, PR. NEVER merge, deploy to production, touch .env, or delete data.`,
    `Do not commit .env or secrets. Do not restore demo studio data (Meridian, Atlas, fake invoices).`,
    `Paidly marketing dashboard numbers are not real invoices.`,
  ]
    .filter(Boolean)
    .join('\n')

  const fullPrompt = `${header}\n\n${prompt}`.slice(0, MAX_PROMPT)

  const { Agent, CursorAgentError } = await import('@cursor/sdk')
  const snapshot: CursorSnapshot = {
    id,
    status: 'queued',
    product,
    title,
    promptPreview: prompt.slice(0, 280),
    cwd,
    source,
    startedAt: new Date().toISOString(),
  }

  let cancelled = false
  let runHandle: { supports: (op: 'cancel') => boolean; cancel: () => Promise<void> } | undefined
  let agentHandle: { [Symbol.asyncDispose]?: () => Promise<void>; close?: () => void } | undefined

  const cancel = async () => {
    cancelled = true
    snapshot.status = 'cancelled'
    snapshot.finishedAt = new Date().toISOString()
    if (runHandle?.supports('cancel')) {
      try {
        await runHandle.cancel()
      } catch {
        /* already done */
      }
    }
  }

  active = { snapshot, cancel }
  void persist(snapshot)

  void (async () => {
    const timer = setTimeout(() => {
      void cancel()
    }, MAX_RUN_MS)
    try {
      const agent = await Agent.create({
        apiKey,
        model: { id: MODEL },
        local: { cwd, settingSources: ['project', 'user'] },
      })
      agentHandle = agent
      snapshot.agentId = agent.agentId
      snapshot.status = 'running'
      void persist(snapshot)

      const run = await agent.send(fullPrompt)
      runHandle = run
      snapshot.runId = run.id
      void persist(snapshot)

      void (async () => {
        try {
          for await (const event of run.stream()) {
            const e = event as { type?: string; text?: string; message?: { content?: { type?: string; text?: string }[] } }
            if (e.type === 'assistant' && e.message?.content) {
              const chunk = e.message.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
              if (chunk) snapshot.liveText = (snapshot.liveText ?? '') + chunk
              if ((snapshot.liveText?.length ?? 0) > 4000) snapshot.liveText = snapshot.liveText?.slice(-4000)
            }
          }
        } catch {
          /* stream optional — wait() is the source of truth */
        }
      })()

      const result = await run.wait()
      snapshot.status = cancelled ? 'cancelled' : result.status === 'finished' ? 'finished' : result.status === 'cancelled' ? 'cancelled' : 'error'
      snapshot.summary = (result.result ?? snapshot.liveText ?? '').slice(0, 2000)
      if (result.status === 'error') snapshot.error = result.error?.message ?? 'Run failed'
    } catch (err) {
      snapshot.status = cancelled ? 'cancelled' : 'error'
      const retry = err && typeof err === 'object' && 'isRetryable' in err ? String((err as { isRetryable?: boolean }).isRetryable) : undefined
      snapshot.error =
        err instanceof CursorAgentError
          ? `${err.message}${retry ? ` · retryable=${retry}` : ''}`
          : err instanceof Error
            ? err.message
            : 'Cursor failed to start'
    } finally {
      clearTimeout(timer)
      snapshot.finishedAt = new Date().toISOString()
      const dispose = agentHandle?.[Symbol.asyncDispose]
      try {
        if (dispose) await dispose.call(agentHandle)
        else agentHandle?.close?.()
      } catch {
        /* dispose best-effort */
      }
      history.unshift({ ...snapshot })
      if (history.length > 12) history.length = 12
      if (active?.snapshot.id === snapshot.id) active = null
      void persist(snapshot)
    }
  })()

  return { status: 202 as const, data: { ok: true, current: snapshot } }
}

function attach(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
  server.middlewares.use((req, res, next) => {
    const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? ''
    if (!url.startsWith('/__aria/cursor')) return next()
    void (async () => {
      try {
        const parsed = new URL(url, 'http://aria.local')
        const method = (req.method ?? 'GET').toUpperCase()

        if (parsed.pathname === '/__aria/cursor/health' && method === 'GET') {
          json(res, 200, publicStatus())
          return
        }
        if (parsed.pathname === '/__aria/cursor/status' && method === 'GET') {
          json(res, 200, publicStatus())
          return
        }
        if (parsed.pathname === '/__aria/cursor/cancel' && method === 'POST') {
          if (!active) {
            json(res, 200, { ok: true, current: history[0] ?? null, message: 'Nothing running' })
            return
          }
          await active.cancel()
          json(res, 200, { ok: true, current: active.snapshot })
          return
        }
        if (parsed.pathname === '/__aria/cursor/run' && method === 'POST') {
          const raw = await readBody(req)
          let body: { prompt?: string; title?: string; product?: CursorProduct; source?: CursorSource } = {}
          try {
            body = raw ? (JSON.parse(raw) as typeof body) : {}
          } catch {
            json(res, 400, { ok: false, error: 'Invalid JSON' })
            return
          }
          const result = await startRun(body)
          json(res, result.status, result.data)
          return
        }
        json(res, 404, { ok: false, error: 'Unknown Aria Cursor route' })
      } catch (err) {
        json(res, 502, { ok: false, error: err instanceof Error ? err.message : 'Cursor bridge failed' })
      }
    })()
  })
}

export function ariaCursor(): Plugin {
  return {
    name: 'aria-cursor',
    configureServer(server) {
      attach(server)
    },
    configurePreviewServer(server) {
      attach(server)
    },
  }
}
