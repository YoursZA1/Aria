import type { BusinessState, CursorJob, CursorProduct, CursorRun, Skill } from '../types'
import { uid } from '../lib/format'

export type CursorHealth = {
  ok: boolean
  configured: boolean
  model?: string
  workspaces?: { aria: string; paidly?: string; brandcafe?: string }
  running?: boolean
  current?: CursorRun | null
  history?: CursorRun[]
  error?: string
}

export async function cursorHealth(): Promise<CursorHealth> {
  try {
    const res = await fetch('/__aria/cursor/health')
    const data = (await res.json()) as CursorHealth
    return { ...data, ok: !!data.ok }
  } catch {
    return { ok: false, configured: false, error: 'Cursor bridge is down — npm run dev' }
  }
}

export async function cursorStatus(): Promise<CursorHealth> {
  try {
    const res = await fetch('/__aria/cursor/status')
    const data = (await res.json()) as CursorHealth
    return { ...data, ok: !!data.ok }
  } catch {
    return { ok: false, configured: false, error: 'Cursor bridge is down' }
  }
}

export async function startCursorRun(job: CursorJob): Promise<{ ok: boolean; current?: CursorRun; error?: string }> {
  const res = await fetch('/__aria/cursor/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: job.prompt,
      title: job.title,
      product: job.product,
      source: job.source,
    }),
  })
  const data = (await res.json()) as { ok?: boolean; current?: CursorRun; error?: string }
  if (!res.ok || !data.ok) return { ok: false, error: data.error || `Cursor run failed (${res.status})`, current: data.current }
  return { ok: true, current: data.current }
}

export async function cancelCursorRun(): Promise<{ ok: boolean; current?: CursorRun; error?: string }> {
  const res = await fetch('/__aria/cursor/cancel', { method: 'POST' })
  const data = (await res.json()) as { ok?: boolean; current?: CursorRun; error?: string }
  if (!res.ok) return { ok: false, error: data.error || 'Cancel failed' }
  return { ok: true, current: data.current }
}

export async function waitForCursor(
  id: string,
  onTick: (snap: CursorRun) => void,
  stopped: () => boolean,
): Promise<CursorRun | undefined> {
  const start = Date.now()
  while (Date.now() - start < 8 * 60_000) {
    if (stopped()) {
      await cancelCursorRun()
      const st = await cursorStatus()
      if (st.current) onTick(st.current)
      return st.current ?? undefined
    }
    const st = await cursorStatus()
    if (st.current) onTick(st.current)
    const snap = st.current
    if (snap && snap.id === id && snap.status !== 'running' && snap.status !== 'queued') return snap
    await new Promise((r) => setTimeout(r, 2000))
  }
  await cancelCursorRun()
  return undefined
}

export function guessProduct(text: string): CursorProduct {
  const t = text.toLowerCase()
  if (/\bpaidly\b/.test(t)) return 'paidly'
  if (/brand\s*caf[eé]|brandcafe/.test(t)) return 'brandcafe'
  return 'aria'
}

export function applyCursorSnap(state: BusinessState, snap: CursorRun | null | undefined, announce: boolean): BusinessState {
  if (!snap) return state
  const prev = state.cursorRun
  const becameDone =
    announce &&
    prev &&
    prev.id === snap.id &&
    (prev.status === 'running' || prev.status === 'queued') &&
    (snap.status === 'finished' || snap.status === 'error' || snap.status === 'cancelled')

  const history = [snap, ...(state.cursorHistory ?? []).filter((r) => r.id !== snap.id)].slice(0, 8)
  const roadmap =
    becameDone && snap.status === 'finished'
      ? state.roadmap.map((n) =>
          n.text === snap.title || n.id === snap.roadmapId || (!n.shipped && snap.source !== 'chat' && n.text.slice(0, 40) === snap.title.slice(0, 40))
            ? { ...n, shipped: true }
            : n,
        )
      : state.roadmap

  let next: BusinessState = {
    ...state,
    cursorRun: snap,
    cursorHistory: history,
    cursorReady: true,
    lastAutopilotAt: snap.source === 'autopilot' || snap.source === 'kernel' ? snap.startedAt ?? state.lastAutopilotAt : state.lastAutopilotAt,
    roadmap,
    repairedIds: snap.status === 'finished' ? [...new Set([...state.repairedIds, 'build-cursor-hands'])] : state.repairedIds,
  }

  if (becameDone && snap.status === 'finished') {
    const skillName = `Shipped: ${snap.title.slice(0, 40)}`
    if (!next.skills.some((s) => s.name === skillName)) {
      const skill: Skill = {
        id: uid('sk'),
        name: skillName,
        keywords: snap.title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .slice(0, 5),
        reply: trimSummary(snap.summary),
        agentId: 'ceo',
        source: 'cursor',
        uses: 0,
        createdAt: new Date().toISOString(),
      }
      if (skill.keywords.length < 1) skill.keywords = ['shipped', 'cursor']
      next = { ...next, skills: [skill, ...next.skills] }
    }
  }

  if (becameDone) {
    const note = {
      id: uid('msg'),
      role: 'assistant' as const,
      agentId: 'ceo' as const,
      intent: snap.status === 'finished' ? 'cursor-done' : snap.status === 'cancelled' ? 'cursor-cancel' : 'cursor-error',
      text:
        snap.status === 'finished'
          ? `GPT planned it. Cursor finished “${snap.title}”. ${trimSummary(snap.summary)}`
          : snap.status === 'cancelled'
            ? `Stopped the Cursor run on “${snap.title}”. Autopilot is ${next.autopilot ? 'still on' : 'off'}.`
            : `Cursor run on “${snap.title}” failed: ${snap.error || 'unknown'}. I will not pretend it shipped.`,
      bullets: snap.summary ? [trimSummary(snap.summary)] : undefined,
      createdAt: new Date().toISOString(),
    }
    next = {
      ...next,
      messages: [...next.messages, note],
      activity: [{ id: uid('log'), text: `Aria autopilot: ${snap.status} · ${snap.title}`, at: note.createdAt }, ...next.activity],
    }
  }
  return next
}

export function cursorBusy(state: BusinessState) {
  return state.cursorRun?.status === 'running' || state.cursorRun?.status === 'queued'
}

function trimSummary(text?: string) {
  if (!text) return 'Check the Aria page for the run log.'
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.slice(0, 420)
}
