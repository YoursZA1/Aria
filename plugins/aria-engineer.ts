import { execFile } from 'node:child_process'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const ROOT = process.cwd()
const BRANCH = /^aria\/improve-[a-z0-9-]{2,40}$/
const FORBIDDEN =
  /\b(merge|rebase|reset --hard|push --force|push -f|gh pr merge|deploy|vercel|drop table|prisma migrate|supabase db)\b/i

type HttpReq = {
  method?: string
  on: (event: string, listener: (arg?: Buffer | string | Error) => void) => void
}
type HttpRes = { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }

function json(res: HttpRes, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

async function git(args: string[], timeout = 20_000) {
  const joined = args.join(' ')
  if (FORBIDDEN.test(joined)) throw new Error('Forbidden git/deploy action. Level 3 — Mando merges.')
  const { stdout, stderr } = await exec('git', args, { cwd: ROOT, timeout, maxBuffer: 2_000_000 })
  return `${stdout}${stderr}`.trim()
}

async function runCheck(cmd: string, args: string[], timeout: number) {
  try {
    const { stdout, stderr } = await exec(cmd, args, { cwd: ROOT, timeout, maxBuffer: 4_000_000 })
    return { ok: true, cmd: [cmd, ...args].join(' '), out: `${stdout}${stderr}`.trim().slice(-4_000) }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return {
      ok: false,
      cmd: [cmd, ...args].join(' '),
      out: `${e.stdout ?? ''}${e.stderr ?? e.message ?? ''}`.trim().slice(-4_000),
    }
  }
}

export async function handleEngineerRequest(
  parsed: URL,
  req: HttpReq,
  res: HttpRes,
  readBody: (req: HttpReq) => Promise<string>,
): Promise<boolean> {
  const path = parsed.pathname
  const method = (req.method ?? 'GET').toUpperCase()
  if (!path.startsWith('/__aria/engineer')) return false

  if (path === '/__aria/engineer/health' && method === 'GET') {
    let branch = ''
    try {
      branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
    } catch {
      branch = 'unknown'
    }
    json(res, 200, {
      ok: true,
      role: 'Aria coding agent · Cursor types · Mando merge',
      levels: { 1: 'observe', 2: 'branch + PR', 3: 'human approval' },
      branch,
      never: ['merge', 'deploy', 'auth', 'payments', 'migrations', 'delete data', 'security rules', 'spend'],
    })
    return true
  }

  if (path === '/__aria/engineer/status' && method === 'GET') {
    try {
      const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
      const porcelain = await git(['status', '--porcelain'])
      json(res, 200, { ok: true, branch, dirty: Boolean(porcelain), status: porcelain.slice(0, 2_000) })
    } catch (err) {
      json(res, 500, { ok: false, error: err instanceof Error ? err.message : 'git status failed' })
    }
    return true
  }

  if (path === '/__aria/engineer/branch' && method === 'POST') {
    let slug = ''
    try {
      const body = JSON.parse(await readBody(req)) as { slug?: string; name?: string }
      slug = String(body.slug || body.name || '').trim()
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON' })
      return true
    }
    const name = slug.startsWith('aria/improve-') ? slug : `aria/improve-${slug.replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')}`
    if (!BRANCH.test(name)) {
      json(res, 400, { ok: false, error: 'Branch must match aria/improve-<slug>' })
      return true
    }
    try {
      const current = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
      if (current === name) {
        json(res, 200, { ok: true, branch: name, created: false })
        return true
      }
      await git(['checkout', '-b', name])
      json(res, 200, { ok: true, branch: name, created: true })
    } catch (err) {
      json(res, 500, { ok: false, error: err instanceof Error ? err.message : 'branch failed' })
    }
    return true
  }

  if (path === '/__aria/engineer/checks' && method === 'POST') {
    const lint = await runCheck('npm', ['run', 'lint'], 60_000)
    const test = await runCheck('npx', ['vitest', 'run'], 90_000)
    const build = await runCheck('npx', ['tsc', '-b', '--pretty', 'false'], 180_000)
    const passed = [lint, test, build].filter((c) => c.ok).length
    json(res, 200, {
      ok: passed === 3,
      passRate: Math.round((passed / 3) * 1000) / 10,
      lint,
      test,
      typecheck: build,
      merge: false,
      note: 'Checks only. I do not merge or deploy.',
    })
    return true
  }

  if (path === '/__aria/engineer/log' && method === 'POST') {
    let body: { markdown?: string; summary?: string } = {}
    try {
      body = JSON.parse(await readBody(req)) as { markdown?: string; summary?: string }
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON' })
      return true
    }
    const md = String(body.markdown || body.summary || '').trim().slice(0, 8_000)
    if (md.length < 20) {
      json(res, 400, { ok: false, error: 'Log entry too short' })
      return true
    }
    try {
      const dir = join(ROOT, 'docs')
      await mkdir(dir, { recursive: true })
      await appendFile(join(dir, 'AI_IMPROVEMENT_LOG.md'), `\n\n${md}\n`)
      json(res, 200, { ok: true, path: 'docs/AI_IMPROVEMENT_LOG.md' })
    } catch (err) {
      json(res, 500, { ok: false, error: err instanceof Error ? err.message : 'log write failed' })
    }
    return true
  }

  if (path === '/__aria/engineer/pr' && method === 'POST') {
    json(res, 403, {
      ok: false,
      error: 'Opening a PR is Level 2 and must be done from a feature branch by the coding agent or Mando. Merging is Level 3 and is never done here.',
    })
    return true
  }

  if (path === '/__aria/engineer/merge' && method === 'POST') {
    json(res, 403, { ok: false, error: 'Level 3. Mando merges. Aria does not.' })
    return true
  }

  json(res, 404, { ok: false, error: 'Unknown engineer route' })
  return true
}
