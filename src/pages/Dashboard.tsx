import { useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import {
  FolderKanban,
  MapPin,
  Megaphone,
  Palette,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import { useBusiness } from '../store/BusinessProvider'
import { AGENTS } from '../data/seed'
import {
  atRiskProject,
  awaitingClients,
  briefingPriorities,
  clientById,
  monthRevenue,
  overdueTotal,
  productionProjects,
  REVENUE_TREND,
  studioScore,
  tasksDueToday,
} from '../engine/insights'
import { goalProgress } from '../engine/goal'
import { greetingFor, money, nextFriday, todayISO, weekdayName } from '../lib/format'
import { AriaBrain } from '../components/viz/AriaBrain'
import { Waveform } from '../components/viz/Waveform'
import { TrendChart } from '../components/viz/TrendChart'
import { ScoreRing } from '../components/viz/ScoreRing'
import { ActionCard } from '../components/ai/ActionCard'
import { VoiceControls } from '../components/ai/VoiceControls'
import { useVoice } from '../store/VoiceProvider'
import type { AgentId } from '../types'

const TOOLS: { id: AgentId; icon: typeof Sparkles; prompt: string }[] = [
  { id: 'ceo', icon: Sparkles, prompt: 'Show me everything I need to deal with today.' },
  { id: 'client', icon: Users, prompt: 'Which clients are awaiting feedback?' },
  { id: 'project', icon: FolderKanban, prompt: 'What is blocking production?' },
  { id: 'finance', icon: Wallet, prompt: "Which clients haven't paid?" },
  { id: 'marketing', icon: Megaphone, prompt: 'Show me the pipeline and campaigns.' },
  { id: 'creative', icon: Palette, prompt: 'Show me the BrandCafé and Paidly brand kits.' },
]

const SHORTCUTS = [
  { label: 'R1m', prompt: 'How do I get from R0 to R1 million?' },
  { label: 'Today', prompt: 'Show me everything I need to deal with today.' },
  { label: 'Priorities', prompt: 'What should I prioritise?' },
  { label: 'Unpaid', prompt: "Which clients haven't paid?" },
  { label: 'Bottleneck', prompt: 'Where am I the bottleneck?' },
  { label: 'Learn', prompt: 'learn about creative agency monthly retainer pricing South Africa' },
  { label: 'Aria', prompt: 'Aria, analyse yourself.' },
]

const WEEK = [
  { d: 'Fri', t: '16°', icon: '☁' },
  { d: 'Sat', t: '17°', icon: '⛅' },
  { d: 'Sun', t: '18°', icon: '☀' },
  { d: 'Mon', t: '15°', icon: '☁' },
  { d: 'Tue', t: '16°', icon: '🌧' },
]

type ShellCtx = { setAiOpen: (open: boolean) => void }

export function Dashboard() {
  const { state, ask, runAction, setAgent, dismissBriefing } = useBusiness()
  const { setAiOpen } = useOutletContext<ShellCtx>()
  const { status, interim, heard, energy } = useVoice()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const greet = greetingFor()
  const last = [...state.messages].reverse().find((m) => m.role === 'assistant')
  const risk = atRiskProject(state)
  const riskClient = risk ? clientById(state, risk.clientId) : undefined
  const friday = nextFriday()
  const todayEvents = state.events.filter((e) => e.date === todayISO())
  const score = studioScore(state)
  const goal = goalProgress(state)

  async function send(text: string) {
    if (!text.trim() || busy) return
    setBusy(true)
    setQ('')
    try {
      await ask(text)
    } finally {
      setBusy(false)
    }
  }

  function selectTool(id: AgentId, prompt: string) {
    setAgent(id)
    send(prompt)
  }

  return (
    <div className="hq">
      <div className="hq-col">
        <section className="glass hello">
          <p className="hello-hi">{greet}, {state.company.owner}.</p>
          <p className="hello-sub">{state.company.tagline} Ultimate goal: R0 → R1 million collected.</p>
          <div className="goal-meter" style={{ ['--pct' as string]: `${goal.pct}%` }} aria-label={`${money(goal.collected)} of ${money(goal.amount)} collected`}>
            <i />
          </div>
          <p className="hello-goal">{goal.empty ? 'Ledger empty — R0 of R1 million. Paidly mock is not your books.' : `${money(goal.collected)} of ${money(goal.amount)} collected (${goal.pct}%) · next ${money(goal.next)}`}</p>
          <Waveform hot={status === 'listening' || status === 'speaking' || status === 'thinking'} />
        </section>

        <section className="glass tools">
          <div className="glass-h">AI Tools</div>
          <div className="tool-grid">
            {TOOLS.map((t) => {
              const Icon = t.icon
              const def = AGENTS.find((a) => a.id === t.id)
              const on = state.selectedAgent === t.id
              return (
                <button key={t.id} type="button" className={`tool ${on ? 'on' : ''}`} onClick={() => selectTool(t.id, t.prompt)}>
                  <span className="tool-ico"><Icon size={22} /></span>
                  <span>{def?.name}</span>
                </button>
              )
            })}
          </div>
          <Link to="/systems" className="explore">Explore all systems →</Link>
        </section>

        <section className="glass shortcuts">
          <div className="glass-h">Smart shortcuts</div>
          <div className="short-row">
            {SHORTCUTS.map((s) => (
              <button key={s.label} type="button" className="short" onClick={() => send(s.prompt)}>
                {s.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="hq-stage">
        <div className="stage-kicker">{state.company.assistantName}</div>
        <div
          className={`holo ${status === 'speaking' ? 'speaking' : ''} ${status === 'listening' ? 'listening' : ''} ${status === 'thinking' ? 'thinking' : ''}`}
          style={{ ['--talk' as string]: Math.max(energy, status === 'listening' ? 0.28 : status === 'thinking' ? 0.18 : 0) }}
        >
          <div className="holo-scale r1"><i className="holo-ring" /></div>
          <div className="holo-scale r2"><i className="holo-ring" /></div>
          <div className="holo-scale r3"><i className="holo-ring" /></div>
          <div className="holo-scale r4"><i className="holo-ring dashed" /></div>
          <AriaBrain
            skills={state.skills.length}
            integrity={state.integrity}
            knowledge={state.knowledge.length}
            energy={energy}
            mood={status === 'listening' || status === 'thinking' || status === 'speaking' ? status : 'idle'}
          />
        </div>
        <div className="speech">
          {(status === 'listening' || status === 'thinking') && (interim || heard) && (
            <div className="caption">{status === 'thinking' ? `You: ${heard || interim}` : interim || heard}</div>
          )}
          {last?.agentId && <div className="agent-label">{AGENTS.find((a) => a.id === last.agentId)?.title}</div>}
          <p>{last?.text ?? `${greet}, ${state.company.owner}. How can I help you today?`}</p>
          {last?.bullets && last.bullets.length > 0 && (
            <ul>
              {last.bullets.slice(0, 2).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {last?.actions?.map((a) => (
            <ActionCard
              key={a.id}
              action={a}
              busy={busy}
              onPrimary={() => {
                setBusy(true)
                const href = runAction(last.id, a, 'primary')
                if (href) nav(href)
                window.setTimeout(() => setBusy(false), 240)
              }}
              onSecondary={() => {
                const href = runAction(last.id, a, 'secondary')
                if (href) nav(href)
              }}
            />
          ))}
        </div>
        <form
          className="stage-input"
          onSubmit={(e) => {
            e.preventDefault()
            send(q)
          }}
        >
          <input
            value={status === 'listening' || status === 'thinking' ? interim || q : q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={status === 'listening' ? 'Listening…' : `${state.company.assistantName}, what should I handle?`}
            aria-label="Command the assistant"
          />
          <button type="submit" className="solid" disabled={busy || !q.trim()}>Go</button>
        </form>
        <VoiceControls size="lg" />
        <button type="button" className="log-link" onClick={() => setAiOpen(true)}>
          Open full log
        </button>
      </div>

      <div className="hq-col">
        <section className="glass weather">
          <div className="wx-top">
            <span><MapPin size={14} /> South Africa</span>
            <span className="muted">BrandCafé</span>
          </div>
          <div className="wx-main">
            <div>
              <div className="wx-temp">16°</div>
              <div className="wx-stat">Partly cloudy</div>
            </div>
            <div className="wx-moon" aria-hidden>
              <span className="moon" />
              <span className="cloud" />
            </div>
          </div>
          <div className="wx-week">
            {WEEK.map((d) => (
              <div key={d.d}>
                <b>{d.d}</b>
                <span>{d.icon}</span>
                <em>{d.t}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="glass insights">
          <div className="glass-h">AI Insights</div>
          <TrendChart values={REVENUE_TREND} />
          <div className="insight-foot">
            <div>
              <div className="prod">{state.lastLiveSync ? `Live sites · ${new Date(state.lastLiveSync).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}` : 'Waiting on live sync'}</div>
              <div className="muted" style={{ marginTop: 8 }}>
                {money(monthRevenue(state))} MTD · {tasksDueToday(state).length} due · {productionProjects(state).length} in production
                {REVENUE_TREND.every((n) => n === 0) ? ' · no revenue trend yet' : ''}
              </div>
              {risk && riskClient && !state.briefingDismissed && (
                <div className="mini-alert">
                  {riskClient.name} is {risk.daysBehind}d behind{risk.bottleneck ? ` — ${risk.bottleneck}` : ''}. Move review to {weekdayName(friday).split(',')[0]}?
                  <div className="alert-actions">
                    <button type="button" className="solid" onClick={() => send('What is blocking production?')}>Handle it</button>
                    <Link to="/projects" className="ghost">View</Link>
                    <button type="button" className="ghost" onClick={dismissBriefing}>Ignore</button>
                  </div>
                </div>
              )}
            </div>
            <ScoreRing score={score} />
          </div>
        </section>

        {state.notices.length > 0 && (
          <section className="glass timeline">
            <div className="glass-h">Mando, I noticed</div>
            {state.notices.slice(0, 2).map((n) => (
              <button
                key={n.id}
                type="button"
                className="time-row notice-row"
                onClick={() => (n.prompt ? send(n.prompt) : nav(n.href ?? '/aria'))}
              >
                <span>P{n.priority}</span>
                <p>{n.text.replace(/^Mando, I noticed /, '')}</p>
              </button>
            ))}
          </section>
        )}

        <section className="glass timeline">
          <div className="glass-h">{state.company.assistantName} kernel · {state.integrity}</div>
          {[...state.findings].sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open')).slice(0, 2).map((f) => (
            <div key={f.id} className="time-row">
              <span>{f.loop}</span>
              <p>{f.title}</p>
            </div>
          ))}
          <div className="time-row">
            <span>Skills</span>
            <p>{state.skills.length} grown · {state.repairedIds.length} repairs · loop every 90s</p>
          </div>
          <Link to="/aria" className="explore">Open kernel →</Link>
        </section>

        <section className="glass timeline">
          <div className="glass-h">Today {todayEvents[0] ? todayEvents[0].time : ''}</div>
          {todayEvents.length === 0 && (
            <div className="time-row">
              <span>—</span>
              <p>No calendar items today.</p>
            </div>
          )}
          {todayEvents.map((e) => (
            <div key={e.id} className="time-row">
              <span>{e.time}</span>
              <p>{e.title}</p>
            </div>
          ))}
          {awaitingClients(state).length > 0 && (
            <div className="time-row">
              <span>Now</span>
              <p>{awaitingClients(state).map((c) => c.name).join(' · ')} awaiting feedback</p>
            </div>
          )}
          <div className="time-row">
            <span>R1m</span>
            <p>{money(goal.collected)} collected of {money(goal.amount)} · {goal.empty ? 'ledger empty' : `${goal.pct}%`}</p>
          </div>
          <div className="time-row">
            <span>Cash</span>
            <p>{money(overdueTotal(state))} overdue · {briefingPriorities(state).length} priorities left</p>
          </div>
        </section>
      </div>
    </div>
  )
}
