import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AgentId, BusinessState, ChatMessage, CursorJob, Email, ProposedAction } from '../types'
import { createSeed } from '../data/seed'
import { openingMessage, think } from '../engine/brain'
import { evolve, matchSkill, matchWiredSkill } from '../engine/kernel'
import { approveLevel3, approveTicket, gateTask, runImprovementCycle } from '../engine/engineer'
import { absorbKnowledge, browseWeb, browserHealth, nextCurriculum, researchReply } from '../engine/browser'
import { ariaThink, compactStudio, researchDigest, shouldUseGpt, type StudioSnapshot } from '../engine/openai'
import { fetchCodeContext, localCodeBrief } from '../engine/code'
import { DECISION_SKILL_NAMES, RESEARCH_SKILL_NAMES, learnCursorCatalog, listCursorSkills, matchCursorSkills, readCursorSkill } from '../engine/skills'
import { followUpDraft, proposalDraft, reminderDrafts, rescheduleDraft } from '../engine/actions'
import { awaitingClients, overloadedPeople, personById, silentClients } from '../engine/insights'
import { hydrateFromLive, pullLivePages } from '../engine/live'
import { applyCursorSnap, cancelCursorRun, cursorBusy, cursorHealth, cursorStatus, startCursorRun } from '../engine/cursor'
import { jobFromTask, isEmptyBuild, nextBuildJob, pickAutopilotJob, planCursorJob, spokenDraft } from '../engine/cursorPrompt'
import { applyKernel, improveCycleNow, KERNEL_PROMPTS, type KernelAction } from '../engine/kernelActions'
import { isDelegatableTask } from '../engine/founder'
import { nextMonday, stripAddress, todayISO, uid, weekdayName } from '../lib/format'
import { normalizeTranscript } from '../lib/hear'

const KEY = 'business-ai-v3'

function persist(state: BusinessState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

function load(): BusinessState {
  const seed = createSeed()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      seed.messages = [openingMessage(seed)]
      return seed
    }
    const parsed = JSON.parse(raw) as Partial<BusinessState>
    const alreadyCoding = parsed.writeModeSeed === 'coding-agent'
    const merged: BusinessState = {
      ...seed,
      ...parsed,
      company: {
        ...seed.company,
        ...parsed.company,
        tagline: seed.company.tagline,
        owner: seed.company.owner,
        ownerShort: seed.company.ownerShort,
        paidlyUrl: seed.company.paidlyUrl,
        brandCafeUrl: seed.company.brandCafeUrl,
        assistantName: parsed.company?.assistantName ?? seed.company.assistantName,
      },
      roadmap: parsed.roadmap ?? [],
      skills: parsed.skills ?? [],
      findings: parsed.findings ?? [],
      misses: parsed.misses ?? [],
      repairedIds: parsed.repairedIds ?? [],
      integrity: parsed.integrity ?? 100,
      notices: parsed.notices ?? [],
      opportunities: parsed.opportunities ?? [],
      knowledge: parsed.knowledge ?? [],
      autopilot: parsed.autopilot ?? true,
      writeMode: alreadyCoding ? (parsed.writeMode === 'off' ? 'off' : 'branch') : 'branch',
      writeModeSeed: 'coding-agent',
      cursorHistory: parsed.cursorHistory ?? [],
      tickets: parsed.tickets ?? [],
      reports: parsed.reports ?? [],
      evals: parsed.evals ?? [],
      approvedTicketIds: parsed.approvedTicketIds ?? [],
      level3Approved: parsed.level3Approved === true,
      level3ApprovedAt: parsed.level3ApprovedAt,
      lastImproveAt: parsed.lastImproveAt,
      decisions: parsed.decisions ?? [],
    }
    if (!merged.messages?.length) merged.messages = [openingMessage(merged)]
    if (!alreadyCoding) persist(merged)
    return merged
  } catch {
    seed.messages = [openingMessage(seed)]
    return seed
  }
}

function stamp(): { id: string; at: string } {
  return { id: uid('log'), at: new Date().toISOString() }
}

type StoreApi = {
  state: BusinessState
  ask: (text: string, opts?: { voice?: boolean }) => Promise<void>
  learnNow: (query?: string) => Promise<void>
  refreshLive: () => Promise<void>
  evolveNow: () => void
  toggleAutopilot: () => void
  toggleWriteMode: () => void
  stopCursor: () => Promise<void>
  buildNow: (task?: string) => Promise<void>
  runKernel: (action: KernelAction) => Promise<void>
  runAction: (messageId: string, action: ProposedAction, variant?: 'primary' | 'secondary') => string | undefined
  setAgent: (id: AgentId | 'auto') => void
  dismissBriefing: () => void
  toggleTheme: () => void
  reset: () => void
}

const Ctx = createContext<StoreApi | null>(null)

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BusinessState>(() => load())
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  const commit = useCallback((updater: (prev: BusinessState) => BusinessState) => {
    setState((prev) => {
      const next = updater(prev)
      persist(next)
      return next
    })
  }, [])

  const launchCursor = useCallback(async (job: CursorJob) => {
    const current = stateRef.current
    const gate = gateTask(job.title, {
      writeMode: current.writeMode ?? 'branch',
      source: job.source,
      approvedIds: current.approvedTicketIds,
      level3Approved: current.level3Approved,
    })
    if (!gate.ok) {
      commit((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: uid('msg'),
            role: 'assistant' as const,
            agentId: 'ceo' as const,
            intent: 'engineer-gate',
            text: gate.reason,
            createdAt: new Date().toISOString(),
          },
        ],
      }))
      return
    }
    if (cursorBusy(stateRef.current)) return
    commit((prev) => ({
      ...prev,
      activity: [{ id: uid('log'), text: `Aria autopilot: GPT planning “${job.title}”`, at: new Date().toISOString() }, ...prev.activity],
    }))
    const health = await cursorHealth()
    const planned = await planCursorJob(
      stateRef.current,
      job.prompt || job.title,
      job.source,
      job.title,
      job.roadmapId,
      health.workspaces,
    )
    if (planned.reject) {
      commit((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: uid('msg'),
            role: 'assistant' as const,
            agentId: 'ceo' as const,
            intent: 'ship-reject',
            text: planned.reject || 'GPT rejected this as vanity work.',
            createdAt: new Date().toISOString(),
          },
        ],
      }))
      return
    }
    const toRun = planned.job
    if (!health.configured) {
      commit((prev) => ({
        ...prev,
        cursorReady: false,
        messages: [
          ...prev.messages,
          {
            id: uid('msg'),
            role: 'assistant' as const,
            agentId: 'ceo' as const,
            intent: 'cursor-error',
            text: planned.via === 'gpt'
              ? `GPT brief is ready for “${toRun.title}”, but Cursor is not configured. Add CURSOR_API_KEY to .env (Cursor Dashboard → Integrations) and restart Vite. The key stays on the server.`
              : 'Cursor is not configured. Add CURSOR_API_KEY to .env (Cursor Dashboard → Integrations) and restart Vite. The key stays on the server.',
            bullets: planned.bullets,
            createdAt: new Date().toISOString(),
          },
        ],
      }))
      return
    }
    try {
      const started = await startCursorRun(toRun)
      if (!started.ok || !started.current) {
        commit((prev) => ({
          ...prev,
          cursorReady: true,
          messages: [
            ...prev.messages,
            {
              id: uid('msg'),
              role: 'assistant' as const,
              agentId: 'ceo' as const,
              intent: 'cursor-error',
              text: started.error || 'Cursor refused the run.',
              createdAt: new Date().toISOString(),
            },
          ],
        }))
        return
      }
      const snap = { ...started.current, roadmapId: toRun.roadmapId }
      commit((prev) => ({
        ...applyCursorSnap(prev, snap, false),
        lastAutopilotAt: toRun.source === 'autopilot' || toRun.source === 'kernel' ? new Date().toISOString() : prev.lastAutopilotAt,
        activity: [{ id: uid('log'), text: `Aria autopilot: Cursor started “${snap.title}” (${planned.via})`, at: new Date().toISOString() }, ...prev.activity],
        messages: planned.bullets?.length
          ? [
              ...prev.messages,
              {
                id: uid('msg'),
                role: 'assistant' as const,
                agentId: 'ceo' as const,
                intent: 'building',
                text: planned.via === 'gpt'
                  ? `GPT brief is ready. Cursor is implementing “${toRun.title}”.`
                  : `ChatGPT plan route is down — local brief. Cursor is still implementing “${toRun.title}”.`,
                bullets: planned.bullets,
                createdAt: new Date().toISOString(),
              },
            ]
          : prev.messages,
      }))
    } catch (err) {
      commit((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: uid('msg'),
            role: 'assistant' as const,
            agentId: 'ceo' as const,
            intent: 'cursor-error',
            text: `Cursor bridge failed: ${err instanceof Error ? err.message : 'unknown'}`,
            createdAt: new Date().toISOString(),
          },
        ],
      }))
    }
  }, [commit])

  const refreshFromSites = useCallback(async () => {
    try {
      const pages = await pullLivePages()
      commit((prev) => hydrateFromLive(prev, pages))
    } catch {
      /* Vite proxy down — stay on empty ledger, do not invent */
    }
  }, [commit])

  useEffect(() => {
    const boot = window.setTimeout(() => commit((prev) => evolve(prev)), 500)
    const live = window.setTimeout(() => {
      void refreshFromSites()
    }, 700)
    const skillsBoot = window.setTimeout(() => {
      void (async () => {
        const catalog = await listCursorSkills()
        if (!catalog.length) return
        commit((prev) => learnCursorCatalog(prev, catalog).state)
      })()
    }, 600)
    const loop = window.setInterval(() => commit((prev) => evolve(prev)), 90_000)
    const lesson = window.setTimeout(() => {
      void (async () => {
        if (stateRef.current.knowledge.length > 0) return
        const live = await browserHealth()
        if (!live.ok) return
        const topic = nextCurriculum(stateRef.current)
        try {
          const items = await browseWeb(topic.q)
          commit((prev) => {
            if (prev.knowledge.length > 0) return prev
            const absorbed = absorbKnowledge(prev, items, topic.q)
            const note: ChatMessage = {
              id: uid('msg'),
              role: 'assistant',
              agentId: 'ceo',
              intent: 'research',
              text: `Mando, I went on the web for ${topic.why}: “${topic.q}”. I’m keeping the takeaway, not the article.`,
              bullets: items.slice(0, 3).map((k) => `${k.title} — ${k.takeaway}`),
              createdAt: new Date().toISOString(),
            }
            return { ...absorbed, messages: [...absorbed.messages, note] }
          })
        } catch {
          /* offline or blocked — stay silent */
        }
      })()
    }, 3200)
    return () => {
      window.clearTimeout(boot)
      window.clearTimeout(live)
      window.clearTimeout(skillsBoot)
      window.clearInterval(loop)
      window.clearTimeout(lesson)
    }
  }, [commit, refreshFromSites])

  useEffect(() => {
    const running = state.cursorRun?.status === 'running' || state.cursorRun?.status === 'queued'
    if (!running) return
    const id = window.setInterval(() => {
      void (async () => {
        const snap = await cursorStatus()
        commit((prev) => applyCursorSnap(prev, snap.current ?? prev.cursorRun, true))
      })()
    }, 2000)
    return () => window.clearInterval(id)
  }, [state.cursorRun?.status, state.cursorRun?.id, commit])

  useEffect(() => {
    let stop = false
    const tick = async () => {
      if (stop) return
      const current = stateRef.current
      const health = await cursorHealth()
      if (stop) return
      commit((prev) => ({ ...prev, cursorReady: health.configured && health.ok }))
      if (!current.autopilot || !health.configured) return
      if (cursorBusy(current)) return
      const draft = pickAutopilotJob(current)
      if (!draft) return
      await launchCursor(jobFromTask(current, draft.task, draft.source, draft.title, draft.roadmapId))
    }
    const boot = window.setTimeout(() => void tick(), 8000)
    const loop = window.setInterval(() => void tick(), 120_000)
    return () => {
      stop = true
      window.clearTimeout(boot)
      window.clearInterval(loop)
    }
  }, [commit, launchCursor])

  const ask = useCallback(async (text: string, opts?: { voice?: boolean }) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const pending: {
      query: string
      url?: string
      lookingId: string
      live?: boolean
      mode?: 'research' | 'think'
      intent?: string
      userText?: string
      snapshot?: StudioSnapshot
      cursorJob?: CursorJob
      shipText?: string
      cancelCursor?: boolean
      autopilot?: boolean
      writeMode?: 'off' | 'branch'
      buildNote?: string
      skillName?: string
      voice?: boolean
      draft?: { text: string; bullets?: string[] }
      history?: { role: 'user' | 'assistant'; text: string }[]
    } = { query: '', lookingId: '' }

    commit((prev) => {
      const name = prev.company.assistantName ?? 'Aria'
      const normalised = normalizeTranscript(trimmed, name)
      const heard = stripAddress(normalised, name)
      const forBrain = heard || normalised || 'hello'
      const user: ChatMessage = { id: uid('msg'), role: 'user', text: trimmed, createdAt: new Date().toISOString() }
      let withUser: BusinessState = { ...prev, messages: [...prev.messages, user] }
      if (/repair yourself|fix yourself|evolve|grow yourself|scan yourself|analyse yourself|analyze yourself/.test(forBrain.toLowerCase())) {
        withUser = evolve(withUser)
      }
      const result0 = think(forBrain, withUser)
      if (result0.intent === 'improve-run') {
        const ran = runImprovementCycle(withUser)
        withUser = ran.state
      }
      const result = result0.intent === 'improve-run'
        ? { ...result0, ...improveCycleNow(withUser), intent: 'improve' as const }
        : result0
      const used = result.intent === 'cursor-skill'
        ? matchWiredSkill(forBrain, withUser.skills)
        : result.intent === 'skill'
          ? matchSkill(forBrain, withUser.skills)
          : undefined
      const skills = used
        ? withUser.skills.map((s) => (s.id === used.id ? { ...s, uses: s.uses + 1 } : s))
        : withUser.skills
      const misses = result.intent === 'fallback'
        ? [forBrain, ...withUser.misses].slice(0, 12)
        : withUser.misses
      const researching = result.intent === 'research'
      const thinking = shouldUseGpt(result.intent) && result.intent !== 'research'
      const liveSync = result.intent === 'live-sync'
      const waiting = researching || thinking || liveSync
      const lookingId = uid('msg')
      const assistant: ChatMessage = {
        id: lookingId,
        role: 'assistant',
        agentId: result.agentId,
        text: waiting
          ? (result.text || `Give me a second — I’m on the web for “${result.researchQuery || forBrain}”.`)
          : result.text,
        bullets: researching || liveSync ? undefined : result.bullets,
        actions: result.actions,
        intent: liveSync || researching ? 'researching' : thinking ? 'thinking' : result.intent,
        createdAt: new Date().toISOString(),
      }
      if (liveSync) {
        pending.live = true
        pending.lookingId = lookingId
      } else if (researching) {
        pending.mode = 'research'
        pending.query = result.researchQuery || forBrain
        pending.url = result.researchUrl
        pending.lookingId = lookingId
        pending.userText = forBrain
        pending.snapshot = compactStudio(withUser)
        pending.draft = { text: result.text, bullets: result.bullets }
        pending.history = withUser.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-8)
          .map((m) => ({ role: m.role, text: m.text.slice(0, 500) }))
      } else if (thinking) {
        pending.mode = 'think'
        pending.query = result.researchQuery || forBrain
        pending.lookingId = lookingId
        pending.intent = result.intent
        pending.userText = forBrain
        pending.snapshot = compactStudio(withUser)
        pending.draft = { text: result.text, bullets: result.bullets }
        pending.history = withUser.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-8)
          .map((m) => ({ role: m.role, text: m.text.slice(0, 500) }))
      }
      if (result.cursorJob) pending.cursorJob = result.cursorJob
      if (result.shipText) pending.shipText = result.shipText
      if (result.cancelCursor) pending.cancelCursor = true
      if (result.autopilot !== undefined) pending.autopilot = result.autopilot
      if (result.writeMode !== undefined) pending.writeMode = result.writeMode
      if (result.buildNote) pending.buildNote = result.buildNote
      if (result.skillName) pending.skillName = result.skillName
      if (opts?.voice) pending.voice = true
      const noteAt = new Date().toISOString()
      const roadmap = result.buildNote
        ? [{ id: uid('rd'), text: result.buildNote, at: noteAt }, ...withUser.roadmap]
        : withUser.roadmap
      const activity = result.buildNote
        ? [{ id: uid('log'), text: `Build note: ${result.buildNote}`, at: noteAt }, ...withUser.activity]
        : withUser.activity
      const journal = result.intent === 'decide' || result.intent === 'exec' || (result.skillName && DECISION_SKILL_NAMES.has(result.skillName))
        ? [{
            id: uid('dec'),
            decision: forBrain.slice(0, 160),
            date: new Date().toISOString().slice(0, 10),
            context: 'BrandCafé + Paidly',
            options: '',
            recommendation: result.text.slice(0, 280),
            decisionMade: '',
            expectedOutcome: '',
            actualOutcome: '',
            lessonsLearned: '',
          }, ...(withUser.decisions ?? [])].slice(0, 40)
        : withUser.decisions ?? []
      let next: BusinessState = {
        ...withUser,
        skills,
        misses,
        roadmap,
        activity,
        decisions: journal,
        messages: [...withUser.messages, assistant],
        lastIntent: result.intent,
        selectedAgent: prev.selectedAgent,
        autopilot: result.autopilot ?? prev.autopilot,
        writeMode: result.writeMode ?? prev.writeMode,
      }
      if (result.level3Approved) next = approveLevel3(next)
      if (!researching && !liveSync && (result.intent === 'fallback' || result.intent === 'build' || result.intent === 'repair-self' || result.intent === 'evolve-self')) {
        next = evolve(next)
      }
      return next
    })

    try {
      if (pending.cancelCursor) {
        await cancelCursorRun()
        const snap = await cursorStatus()
        commit((prev) => applyCursorSnap(prev, snap.current ?? prev.cursorRun, true))
      }
      if (pending.cursorJob) await launchCursor(pending.cursorJob)
      if (pending.shipText && !pending.cursorJob) {
        const draft = spokenDraft(pending.shipText, stateRef.current)
        await launchCursor(jobFromTask(stateRef.current, draft.task, draft.source, draft.title, draft.roadmapId))
      }

      if (!pending.lookingId) return

      let attached: { name: string; body: string } | undefined
      if (pending.mode === 'think' || pending.mode === 'research') {
        const hits = await matchCursorSkills(pending.userText || pending.query)
        const forced = pending.skillName ? await readCursorSkill(pending.skillName) : null
        const named = forced ?? (pending.skillName ? hits.find((h) => h.name === pending.skillName) : undefined) ?? hits[0]
        if (named?.body) {
          attached = { name: named.name, body: named.body }
          if (pending.intent === 'fallback') pending.intent = 'cursor-skill'
          if (RESEARCH_SKILL_NAMES.has(named.name) && pending.mode === 'think') {
            pending.mode = 'research'
            pending.query = named.name === 'competitive-intelligence'
              ? `${pending.userText || pending.query} Paidly invoicing SaaS competitors South Africa BrandCafé`
              : pending.userText || pending.query
          }
        }
      }

      if (pending.live) {
      try {
        const pages = await pullLivePages()
        commit((prev) => {
          const next = hydrateFromLive(prev, pages)
          const orgs = next.clients.filter((c) => c.id.startsWith('live-') && c.id !== 'live-self')
          const products = next.projects.filter((p) => p.id.startsWith('live-'))
          return {
            ...next,
            lastIntent: 'live-sync',
            messages: next.messages.map((m) =>
              m.id === pending.lookingId
                ? {
                    ...m,
                    intent: 'live-sync',
                    text: `Synced ${next.company.brandCafeUrl} and ${next.company.paidlyUrl}. ${orgs.length} organisations and ${products.length} products off the public sites. The Paidly homepage is marketing — not your books.`,
                    bullets: [
                      ...products.map((p) => `${p.name} · ${p.status}`),
                      orgs.length ? `Named: ${orgs.map((c) => c.name).join(', ')}.` : 'No organisations parsed from the page text.',
                    ],
                  }
                : m,
            ),
          }
        })
      } catch (err) {
        commit((prev) => ({
          ...prev,
          lastIntent: 'live-sync',
          messages: prev.messages.map((m) =>
            m.id === pending.lookingId
              ? {
                  ...m,
                  intent: 'live-sync',
                  text: `Live sync failed: ${err instanceof Error ? err.message : 'unknown'}. I need npm run dev so I can read the two sites — I will not invent a studio.`,
                }
              : m,
          ),
        }))
      }
      return
    }
    if (pending.mode === 'think' && pending.snapshot) {
      const pack = pending.intent === 'code' ? await fetchCodeContext(pending.userText || pending.query) : null
      const gpt = await ariaThink({
        text: pending.userText || pending.query,
        intent: pending.intent || 'fallback',
        snapshot: pending.snapshot,
        skill: attached,
        voice: pending.voice,
        code: pack ?? undefined,
        draft: pending.draft,
        history: pending.history,
      })
      if (gpt.ok) {
        commit((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === pending.lookingId
              ? {
                  ...m,
                  intent: pending.intent,
                  text: gpt.reply.text,
                  bullets: gpt.reply.bullets ?? m.bullets,
                  agentId: gpt.reply.agentId ?? m.agentId,
                }
              : m,
          ),
        }))
        return
      }
      if (pending.intent === 'code') {
        const fallback = localCodeBrief(pack, pending.userText || pending.query)
        commit((prev) => ({
          ...prev,
          lastIntent: 'code',
          messages: prev.messages.map((m) =>
            m.id === pending.lookingId
              ? { ...m, intent: 'code', text: fallback.text, bullets: fallback.bullets }
              : m,
          ),
        }))
        return
      }
      if (pending.intent !== 'fallback' && pending.intent !== 'cursor-skill') {
        commit((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === pending.lookingId
              ? {
                  ...m,
                  intent: pending.intent,
                  text: `${gpt.error}. Local retrieve:\n\n${m.text}`,
                }
              : m,
          ),
        }))
        return
      }
      pending.mode = 'research'
    }
    try {
      const items = await browseWeb(pending.query, pending.url)
      let reply = researchReply(pending.query, items)
      if (pending.snapshot) {
        const gpt = await ariaThink({
          text: pending.userText || pending.query,
          intent: pending.intent === 'cursor-skill' ? 'cursor-skill' : 'research',
          snapshot: pending.snapshot,
          research: researchDigest(pending.query, items),
          skill: attached,
          voice: pending.voice,
          draft: pending.draft,
          history: pending.history,
        })
        if (gpt.ok) reply = { text: gpt.reply.text, bullets: gpt.reply.bullets ?? reply.bullets }
      }
      commit((prev) => {
        const absorbed = absorbKnowledge(prev, items, pending.query)
        return {
          ...absorbed,
          lastIntent: 'research',
          messages: absorbed.messages.map((m) =>
            m.id === pending.lookingId
              ? { ...m, intent: 'research', text: reply.text, bullets: reply.bullets }
              : m,
          ),
        }
      })
    } catch (err) {
      commit((prev) => ({
        ...prev,
        lastIntent: 'research',
        messages: prev.messages.map((m) =>
          m.id === pending.lookingId
            ? {
                ...m,
                intent: 'research',
                text: `Browser path failed: ${err instanceof Error ? err.message : 'unknown'} I will not fake a source.`,
              }
            : m,
        ),
      }))
    }
    } finally {
      if (pending.buildNote && stateRef.current.autopilot && !cursorBusy(stateRef.current) && !pending.cursorJob) {
        await launchCursor(jobFromTask(stateRef.current, pending.buildNote, 'chat'))
      }
    }
  }, [commit, launchCursor])

  const learnNow = useCallback(async (query?: string) => {
    const topic = query?.trim() || nextCurriculum(stateRef.current).q
    await ask(`learn about ${topic}`)
  }, [ask])

  const runAction = useCallback((messageId: string, action: ProposedAction, variant: 'primary' | 'secondary' = 'primary') => {
    let navigateTo: string | undefined
    let pendingJob: CursorJob | undefined
    commit((prev) => {
      if (variant === 'secondary' && action.kind === 'reschedule') {
        navigateTo = '/projects'
        return patchMessage(prev, messageId, action.id, 'done')
      }
      if (action.kind === 'view_project' || (variant === 'secondary' && action.secondaryLabel === 'View project')) {
        navigateTo = '/projects'
        return prev
      }

      let next = patchMessage(prev, messageId, action.id, 'done')
      const note = (text: string) => {
        const s = stamp()
        next = { ...next, activity: [{ id: s.id, text, at: s.at }, ...next.activity] }
      }

      if (action.kind === 'draft_reminders') {
        const drafts = reminderDrafts(next)
        const send: ProposedAction = {
          id: uid('act'),
          kind: 'send_emails',
          label: `Send all ${drafts.length}`,
          description: 'Approve and file in Sent. Nothing leaves this machine except the outbox log.',
          payload: { emails: drafts },
          status: 'proposed',
        }
        const assistant: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          agentId: 'finance',
          intent: 'reminders',
          text: `Reminders are drafted for ${drafts.length} clients. Read them, then send.`,
          bullets: drafts.map((d) => `To ${d.toName}: ${d.subject}`),
          actions: [send],
          createdAt: new Date().toISOString(),
        }
        note(`Drafted ${drafts.length} payment reminders`)
        return { ...next, emails: [...next.emails, ...drafts], messages: [...next.messages, assistant], lastIntent: 'reminders' }
      }

      if (action.kind === 'send_emails') {
        const emails = (action.payload.emails as Email[] | undefined) ?? []
        const sentAt = new Date().toISOString()
        const sent = emails.map((e) => ({ ...e, status: 'sent' as const, sentAt }))
        const remindedIds = sent.map((e) => e.relatedId).filter(Boolean) as string[]
        next = {
          ...next,
          emails: [
            ...next.emails.filter((e) => !sent.some((s) => s.id === e.id)),
            ...sent,
          ],
          invoices: next.invoices.map((inv) => remindedIds.includes(inv.id) ? { ...inv, remindedAt: sentAt } : inv),
        }
        if (action.payload.leadId) {
          next = {
            ...next,
            leads: next.leads.map((l) => l.id === action.payload.leadId ? { ...l, stage: 'proposal' as const, nextStep: 'Wait on reply' } : l),
          }
        }
        note(`Sent ${sent.length} email${sent.length === 1 ? '' : 's'}: ${sent.map((e) => e.toName).join(', ')}`)
        const assistant: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          agentId: 'finance',
          intent: 'sent',
          text: `Sent. ${sent.length} email${sent.length === 1 ? '' : 's'} are in the outbox. I’ll watch for replies.`,
          createdAt: sentAt,
        }
        return { ...next, messages: [...next.messages, assistant] }
      }

      if (action.kind === 'reschedule') {
        const newDate = String(action.payload.newDate ?? '')
        const projectId = String(action.payload.projectId ?? '')
        const clientId = String(action.payload.clientId ?? '')
        const eventId = String(action.payload.eventId ?? '')
        const email = (action.payload.email as Email | undefined) ?? (clientId ? rescheduleDraft(next, clientId, weekdayName(newDate)) : null)
        next = {
          ...next,
          events: next.events.map((e) => (eventId && e.id === eventId) || (projectId && e.projectId === projectId) ? { ...e, date: newDate } : e),
          projects: next.projects.map((p) => p.id === projectId ? { ...p, daysBehind: 0, bottleneck: `Review moved to ${weekdayName(newDate)}.` } : p),
          clients: next.clients.map((c) => c.id === clientId ? { ...c, health: 'watch' as const } : c),
          emails: email ? [...next.emails, { ...email, status: 'sent' as const, sentAt: new Date().toISOString() }] : next.emails,
          briefingDismissed: true,
        }
        note(`Moved review to ${weekdayName(newDate)}${email ? ` and emailed ${email.toName}` : ''}`)
        const assistant: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          agentId: 'project',
          intent: 'handle',
          text: `Done. Review is now ${weekdayName(newDate)}${email ? `, and ${email.toName} has the note` : ''}.`,
          createdAt: new Date().toISOString(),
        }
        return { ...next, messages: [...next.messages, assistant] }
      }

      if (action.kind === 'follow_up') {
        const seen = new Set<string>()
        const targets = [...awaitingClients(next), ...silentClients(next)].filter((c) => {
          if (c.id === 'live-self' || !c.email || seen.has(c.id)) return false
          seen.add(c.id)
          return true
        })
        const emails = targets.map((c) => followUpDraft(next, c.id)).filter(Boolean) as Email[]
        if (!emails.length) {
          const assistant: ChatMessage = {
            id: uid('msg'),
            role: 'assistant',
            agentId: 'client',
            intent: 'followup',
            text: 'Nobody is awaiting feedback with an email on file. Public BrandCafé names are not a chase list.',
            createdAt: new Date().toISOString(),
          }
          return { ...next, messages: [...next.messages, assistant] }
        }
        const send: ProposedAction = {
          id: uid('act'),
          kind: 'send_emails',
          label: `Send ${emails.length} follow-up${emails.length === 1 ? '' : 's'}`,
          description: emails.map((e) => e.toName || e.to).join(', '),
          payload: { emails },
          status: 'proposed',
        }
        const assistant: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          agentId: 'client',
          intent: 'followup',
          text: `${emails.length} follow-up${emails.length === 1 ? '' : 's'} drafted. Approve to send.`,
          bullets: emails.map((e) => `${e.toName} · ${e.subject}`),
          actions: [send],
          createdAt: new Date().toISOString(),
        }
        note('Drafted client follow-ups')
        return { ...next, messages: [...next.messages, assistant] }
      }

      if (action.kind === 'draft_proposal') {
        const email = proposalDraft(next)
        if (!email) {
          const assistant: ChatMessage = {
            id: uid('msg'),
            role: 'assistant',
            agentId: 'marketing',
            intent: 'proposal',
            text: 'No open lead to propose to. Pipeline is empty — I will not invent a prospect.',
            createdAt: new Date().toISOString(),
          }
          return { ...next, messages: [...next.messages, assistant] }
        }
        const send: ProposedAction = {
          id: uid('act'),
          kind: 'send_emails',
          label: 'Send proposal',
          description: `${email.toName} · ${email.subject}`,
          payload: { emails: [email], leadId: email.relatedId },
          status: 'proposed',
        }
        const assistant: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          agentId: 'marketing',
          intent: 'proposal',
          text: `Proposal email is ready for ${email.toName}. Nothing sent yet.`,
          bullets: [email.subject, email.to],
          actions: [send],
          createdAt: new Date().toISOString(),
        }
        return { ...next, messages: [...next.messages, assistant] }
      }

      if (action.kind === 'reassign') {
        const personIds = (action.payload.personIds as string[] | undefined) ?? overloadedPeople(next).map((p) => p.id)
        const monday = nextMonday()
        const today = todayISO()
        const deferred = next.tasks.filter((t) => {
          if (t.status === 'done') return false
          if (personIds.length > 0 && !personIds.includes(t.assigneeId)) return false
          const onToday = t.today || t.due === today
          if (!onToday) return false
          return t.priority === 'low' || isDelegatableTask(t)
        })
        next = {
          ...next,
          tasks: next.tasks.map((t) =>
            deferred.some((d) => d.id === t.id) ? { ...t, due: monday, today: false } : t,
          ),
        }
        const names = personIds.map((id) => personById(next, id)?.name).filter(Boolean).join(', ')
        note(deferred.length ? `Deferred ${deferred.length} low-priority task${deferred.length === 1 ? '' : 's'} to Monday` : 'No low-priority work to defer')
        const assistant: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          agentId: 'project',
          intent: 'team',
          text: deferred.length
            ? `Moved ${deferred.length} low-priority item${deferred.length === 1 ? '' : 's'} to ${weekdayName(monday)}${names ? ` for ${names}` : ''}.`
            : 'Nobody is over capacity with low-priority work to move. I will not invent a team to protect.',
          createdAt: new Date().toISOString(),
        }
        return { ...next, messages: [...next.messages, assistant] }
      }

      if (action.kind === 'engineer_approve') {
        const ticketId = String(action.payload.ticketId ?? '')
        next = ticketId ? approveTicket(next, ticketId) : approveLevel3(next)
        note(ticketId ? `Mando approved ${ticketId} — still a PR, no merge` : 'Mando approved Level 3 — still a PR, no merge')
        const assistant: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          agentId: 'ceo',
          intent: 'level3-approve',
          text: ticketId
            ? `Level 3 ticket ${ticketId} is approved to be implemented on a branch. I still will not merge, deploy, or touch live payments.`
            : 'Level 3 is approved. I may implement auth, payments, migrations, or security on a branch. I still will not merge or deploy.',
          createdAt: new Date().toISOString(),
        }
        return { ...next, messages: [...next.messages, assistant] }
      }

      if (action.kind === 'engineer_implement') {
        const task = String(action.payload.task ?? action.description ?? 'Bounded OS improvement on a branch')
        const gate = gateTask(task, {
          writeMode: 'branch',
          source: 'chat',
          approvedIds: next.approvedTicketIds,
          ticketId: String(action.payload.ticketId ?? ''),
          level3Approved: next.level3Approved,
        })
        if (!gate.ok) {
          const assistant: ChatMessage = {
            id: uid('msg'),
            role: 'assistant',
            agentId: 'ceo',
            intent: 'engineer-gate',
            text: gate.reason,
            createdAt: new Date().toISOString(),
          }
          return { ...next, messages: [...next.messages, assistant] }
        }
        pendingJob = jobFromTask(next, task, 'chat')
        note(`Level 2 branch job queued: ${pendingJob.title}`)
        const assistant: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          agentId: 'ceo',
          intent: 'cursor-build',
          text: `Cursor will implement “${pendingJob.title}” on a branch. You review the PR. I do not merge.`,
          createdAt: new Date().toISOString(),
        }
        return { ...next, messages: [...next.messages, assistant] }
      }

      if (action.kind === 'cursor_build') {
        const task = String(action.payload.note ?? action.description ?? 'Build the latest note')
        pendingJob = jobFromTask(next, task, 'chat')
        note(`Aria Cursor queued: ${pendingJob.title}`)
        const assistant: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          agentId: 'ceo',
          intent: 'cursor-build',
          text: `GPT will write the brief, then Cursor will implement “${pendingJob.title}”. Stop me on the kernel page if you need to.`,
          createdAt: new Date().toISOString(),
        }
        return { ...next, messages: [...next.messages, assistant] }
      }

      return next
    })
    if (pendingJob) void launchCursor(pendingJob)
    return navigateTo
  }, [commit, launchCursor])

  const setAgent = useCallback((id: AgentId | 'auto') => {
    commit((prev) => ({ ...prev, selectedAgent: id }))
  }, [commit])

  const dismissBriefing = useCallback(() => {
    commit((prev) => ({ ...prev, briefingDismissed: true }))
  }, [commit])

  const toggleTheme = useCallback(() => {
    commit((prev) => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }))
  }, [commit])

  const evolveNow = useCallback(() => {
    commit((prev) => evolve(prev))
    void listCursorSkills().then((catalog) => {
      if (!catalog.length) return
      commit((prev) => learnCursorCatalog(prev, catalog).state)
    })
  }, [commit])

  const refreshLive = useCallback(async () => {
    await refreshFromSites()
  }, [refreshFromSites])

  const stopCursor = useCallback(async () => {
    await cancelCursorRun()
    const snap = await cursorStatus()
    commit((prev) => applyCursorSnap(prev, snap.current ?? prev.cursorRun, true))
  }, [commit])

  const toggleWriteMode = useCallback(() => {
    commit((prev) => ({ ...prev, writeMode: prev.writeMode === 'branch' ? 'off' : 'branch' }))
  }, [commit])

  const toggleAutopilot = useCallback(() => {
    const turningOff = stateRef.current.autopilot
    commit((prev) => ({ ...prev, autopilot: !prev.autopilot }))
    if (turningOff && cursorBusy(stateRef.current)) void stopCursor()
  }, [commit, stopCursor])

  const buildNow = useCallback(async (task?: string) => {
    const current = stateRef.current
    if (task?.trim()) {
      await launchCursor(jobFromTask(current, task.trim(), 'chat'))
      return
    }
    const draft = pickAutopilotJob({ ...current, autopilot: true }) ?? nextBuildJob(current, 'kernel')
    if (isEmptyBuild(draft)) {
      commit((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: uid('msg'),
            role: 'assistant' as const,
            agentId: 'ceo' as const,
            intent: 'build',
            text: 'Nothing open to recover — no unshipped note, unanswered miss, or kernel finding. I will not invent a “Build Aria herself” job. Ask me a real question, or add a build note.',
            createdAt: new Date().toISOString(),
          },
        ],
      }))
      return
    }
    await launchCursor(jobFromTask(current, draft.task, draft.source, draft.title, draft.roadmapId))
  }, [launchCursor])

  const runKernel = useCallback(async (action: KernelAction) => {
    if (action === 'learn') {
      await learnNow()
      return
    }
    if (action === 'sync') {
      await refreshLive()
      return
    }
    if (action === 'build') {
      await buildNow()
      return
    }
    const prompt = KERNEL_PROMPTS[action]
    commit((prev) => {
      const applied = applyKernel(prev, action)
      const at = new Date().toISOString()
      const user: ChatMessage = { id: uid('msg'), role: 'user', text: prompt, createdAt: at }
      const assistant: ChatMessage = {
        id: uid('msg'),
        role: 'assistant',
        agentId: applied.reply.agentId,
        intent: applied.reply.intent,
        text: applied.reply.text,
        bullets: applied.reply.bullets,
        actions: applied.reply.actions,
        createdAt: at,
      }
      return {
        ...applied.state,
        messages: [...applied.state.messages, user, assistant],
        lastIntent: applied.reply.intent,
        activity: [{ id: uid('log'), text: `Kernel: ${prompt}`, at }, ...applied.state.activity],
      }
    })
    if (action === 'analyse' || action === 'loop') {
      void listCursorSkills().then((catalog) => {
        if (!catalog.length) return
        commit((prev) => learnCursorCatalog(prev, catalog).state)
      })
    }
  }, [learnNow, refreshLive, buildNow, commit])

  const reset = useCallback(() => {
    localStorage.removeItem(KEY)
    const seed = createSeed()
    seed.messages = [openingMessage(seed)]
    setState(seed)
    persist(seed)
    void refreshFromSites()
  }, [refreshFromSites])

  const api = useMemo<StoreApi>(() => ({
    state, ask, learnNow, refreshLive, evolveNow, toggleAutopilot, toggleWriteMode, stopCursor, buildNow, runKernel, runAction, setAgent, dismissBriefing, toggleTheme, reset,
  }), [state, ask, learnNow, refreshLive, evolveNow, toggleAutopilot, toggleWriteMode, stopCursor, buildNow, runKernel, runAction, setAgent, dismissBriefing, toggleTheme, reset])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useBusiness() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBusiness must be used inside BusinessProvider')
  return ctx
}

function patchMessage(state: BusinessState, messageId: string, actionId: string, status: ProposedAction['status']): BusinessState {
  return {
    ...state,
    messages: state.messages.map((m) =>
      m.id !== messageId ? m : { ...m, actions: m.actions?.map((a) => (a.id === actionId ? { ...a, status } : a)) },
    ),
  }
}
