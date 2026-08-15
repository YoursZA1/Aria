import { Cpu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { VoiceControls } from '../components/ai/VoiceControls'
import { useBusiness } from '../store/BusinessProvider'
import { browserHealth } from '../engine/browser'
import { retainerRunRate } from '../engine/founder'
import { goalProgress } from '../engine/goal'
import {
  atRiskProject,
  awaitingClients,
  clientById,
  monthRevenue,
  overdueInvoices,
  overdueTotal,
  outstandingTotal,
  tasksDueToday,
} from '../engine/insights'
import { nextBuildJob } from '../engine/cursorPrompt'
import { formatEval } from '../engine/engineer'
import type { KernelAction } from '../engine/kernelActions'
import { money } from '../lib/format'

export function AriaKernel() {
  const { state, ask, runKernel, toggleAutopilot, toggleWriteMode, stopCursor, buildNow } = useBusiness()
  const name = state.company.assistantName
  const open = state.findings.filter((f) => f.status === 'open')
  const overdue = overdueTotal(state)
  const outstanding = outstandingTotal(state)
  const today = tasksDueToday(state)
  const waiting = awaitingClients(state)
  const risk = atRiskProject(state)
  const riskClient = risk ? clientById(state, risk.clientId) : undefined
  const retainers = retainerRunRate(state)
  const pursue = state.opportunities.filter((o) => o.verdict === 'pursue').length
  const [engine, setEngine] = useState('…')
  const [gptLive, setGptLive] = useState(false)
  const [cursorSkillCount, setCursorSkillCount] = useState(0)
  const wired = state.skills.filter((s) => s.source === 'cursor')
  const nextJob = nextBuildJob(state)
  const goal = goalProgress(state)
  const [lastKernel, setLastKernel] = useState<KernelAction | null>('analyse')
  const run = (action: KernelAction) => {
    setLastKernel(action)
    void runKernel(action)
  }
  useEffect(() => {
    void browserHealth().then((h) => {
      setEngine(h.google ? 'Google CSE' : h.ok ? 'fallback search' : 'offline')
      setGptLive(h.openai)
      setCursorSkillCount(h.cursorSkills)
    })
  }, [])
  return (
    <div>
      <header className="page-head">
        <div className="kicker">{name} kernel{gptLive ? ' · ChatGPT · Live' : ''} · repo</div>
        <h2>Coding agent</h2>
        <p>
          Three loops, always on — cash, commitments, revenue toward R0 → R1 million. I am the coding agent: I analyse (Level 1), implement on a branch (Level 2), you merge (Level 3). Cursor is how I type. I read this repo before I explain or patch it.
        </p>
        <VoiceControls />
      </header>

      <section className="section">
        <div className="section-h"><h3>Mando&apos;s stack</h3><span>Cash → commitments → revenue → assets</span></div>
        <div className="insight-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className={`insight ${overdue > 0 ? 'risk' : 'good'}`}>
            <div className="area">1 · Cash</div>
            <div className="value">{overdue > 0 ? money(overdue) : 'Clear'}</div>
            <div className="hint">
              {overdue > 0
                ? `${overdueInvoices(state).length} overdue · ${money(outstanding)} outstanding`
                : state.invoices.length === 0
                  ? 'Ledger empty — Paidly mock is not your books'
                  : `${money(outstanding)} outstanding · none overdue`}
            </div>
          </div>
          <div className={`insight ${today.length > 3 || risk ? 'warn' : 'neutral'}`}>
            <div className="area">2 · Commitments</div>
            <div className="value">{today.length || waiting.length || (risk ? 1 : 0)}</div>
            <div className="hint">
              {today.length ? `${today.length} due today` : 'Nothing due today'}
              {waiting.length ? ` · ${waiting.length} awaiting feedback` : ''}
              {riskClient ? ` · ${riskClient.name} ${risk?.daysBehind}d behind` : ''}
            </div>
          </div>
          <div className="insight">
            <div className="area">3 · Revenue → R1m</div>
            <div className="value">{money(goal.collected)}</div>
            <div className="hint">
              {goal.empty
                ? `R0 of ${money(goal.amount)} · MTD ${money(monthRevenue(state))} · ${money(retainers)}/mo retainers`
                : `${goal.pct}% of ${money(goal.amount)} · MTD ${money(monthRevenue(state))} · ${money(retainers)}/mo retainers`}
            </div>
          </div>
          <div className="insight good">
            <div className="area">4 · Assets</div>
            <div className="value">{state.skills.length + pursue}</div>
            <div className="hint">
              {state.skills.length} skills · {pursue} pursue · Paidly + BrandCafé live
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-h">
          <h3>Cursor</h3>
          <span>{state.cursorReady ? 'SDK live' : 'needs CURSOR_API_KEY'}</span>
        </div>
        <div className={`card cursor-run ${state.cursorRun && (state.cursorRun.status === 'running' || state.cursorRun.status === 'queued') ? 'hot' : ''}`}>
          <div className="row">
            <div>
              <div className="title">
                {state.cursorRun && (state.cursorRun.status === 'running' || state.cursorRun.status === 'queued')
                  ? `I’m in Cursor building “${state.cursorRun.title}”`
                  : state.cursorRun?.status === 'finished'
                    ? `Last run: ${state.cursorRun.title}`
                    : 'No Cursor run in flight'}
              </div>
              <div className="sub">
                {state.cursorRun?.error
                  || state.cursorRun?.liveText?.slice(-220)
                  || state.cursorRun?.summary?.slice(0, 220)
                  || (state.cursorReady
                    ? 'Ask how a file works, or tell me to fix it. I retrieve src/ and plugins/ first, then implement — one bounded task. Cursor is how I type. You merge.'
                    : 'Add CURSOR_API_KEY to .env (Cursor Dashboard → Integrations), restart Vite. Key stays on the server.')}
              </div>
            </div>
            <span className={`pill ${state.cursorRun?.status === 'running' || state.cursorRun?.status === 'queued' ? 'warn' : state.cursorRun?.status === 'finished' ? 'good' : 'neutral'}`}>
              {state.cursorRun?.status ?? 'idle'}
            </span>
          </div>
          <div className="alert-actions">
            <button
              type="button"
              className={`switch ${state.autopilot ? 'on' : ''}`}
              onClick={toggleAutopilot}
              aria-pressed={state.autopilot}
            >
              <span className="track" aria-hidden><span className="knob" /></span>
              Autopilot {state.autopilot ? 'on' : 'off'} · {state.writeMode === 'branch' ? 'L2' : 'L1'}
            </button>
            <button
              type="button"
              className={`switch ${state.writeMode === 'branch' ? 'on' : ''}`}
              onClick={toggleWriteMode}
              aria-pressed={state.writeMode === 'branch'}
            >
              <span className="track" aria-hidden><span className="knob" /></span>
              Branch writes {state.writeMode === 'branch' ? 'on' : 'off'} · L2
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!state.cursorRun || (state.cursorRun.status !== 'running' && state.cursorRun.status !== 'queued')}
              onClick={() => void stopCursor()}
            >
              Stop
            </button>
            <button type="button" className="solid" onClick={() => void buildNow()}>
              Build now
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-h"><h3>Aligned to Mando</h3><span>Founder OS</span></div>
        <div className="card">
          <div className="list-item">
            <div className="title">{state.company.tagline}</div>
            <div className="sub">
              <a href={state.company.brandCafeUrl} target="_blank" rel="noreferrer">BrandCafé</a>
              {' · '}
              <a href={state.company.paidlyUrl} target="_blank" rel="noreferrer">Paidly</a>
              {' — live public sites, not a made-up studio.'}
            </div>
          </div>
          <div className="list-item">
            <div className="title">Ultimate goal</div>
            <div className="sub">{goal.headline}</div>
          </div>
          <div className="list-item">
            <div className="title">Default priority</div>
            <div className="sub">Protect cash → deliver commitments → generate revenue → improve what exists → build assets → then explore. Score every move against R0 → R1 million collected.</div>
          </div>
          <div className="list-item">
            <div className="title">North star</div>
            <div className="sub">Valuable businesses, employment, assets, financial independence — R1 million collected is the cash milestone on that path, not valuation theatre.</div>
          </div>
        </div>
      </section>

      <div className="insight-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className={`insight ${state.integrity >= 80 ? 'good' : state.integrity >= 65 ? 'warn' : 'risk'}`}>
          <div className="area">Integrity</div>
          <div className="value">{state.integrity}</div>
          <div className="hint">Kernel health</div>
        </div>
        <div className="insight">
          <div className="area">Skills grown</div>
          <div className="value">{state.skills.length}</div>
          <div className="hint">{wired.length || cursorSkillCount} same as Cursor</div>
        </div>
        <div className="insight warn">
          <div className="area">Open findings</div>
          <div className="value">{open.length}</div>
          <div className="hint">Analyse / repair / build</div>
        </div>
        <div className="insight good">
          <div className="area">Repairs applied</div>
          <div className="value">{state.repairedIds.length}</div>
          <div className="hint">{state.lastScan ? `Last scan ${new Date(state.lastScan).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}` : 'Booting'}</div>
        </div>
      </div>

      <div className="alert-actions" style={{ marginTop: 16 }}>
        <button type="button" className={lastKernel === 'analyse' ? 'solid' : 'ghost'} onClick={() => run('analyse')}>Analyse</button>
        <button type="button" className={lastKernel === 'priorities' ? 'solid' : 'ghost'} onClick={() => run('priorities')}>Priorities</button>
        <button type="button" className={lastKernel === 'opportunities' ? 'solid' : 'ghost'} onClick={() => run('opportunities')}>Opportunities</button>
        <button type="button" className={lastKernel === 'bottleneck' ? 'solid' : 'ghost'} onClick={() => run('bottleneck')}>Bottleneck</button>
        <button type="button" className={lastKernel === 'learn' ? 'solid' : 'ghost'} onClick={() => run('learn')}>Learn from web</button>
        <button type="button" className={lastKernel === 'sync' ? 'solid' : 'ghost'} onClick={() => run('sync')}>Sync live sites</button>
        <button type="button" className={lastKernel === 'build' ? 'solid' : 'ghost'} onClick={() => run('build')}>Build yourself</button>
        <button type="button" className={lastKernel === 'improve' ? 'solid' : 'ghost'} onClick={() => run('improve')}>Improve cycle</button>
        <button type="button" className={lastKernel === 'approve' ? 'solid' : 'ghost'} onClick={() => run('approve')}>
          {state.level3Approved ? 'Level 3 on' : 'Approve Level 3'}
        </button>
        <button type="button" className={lastKernel === 'loop' ? 'solid' : 'ghost'} onClick={() => run('loop')}>Run loop now</button>
      </div>
      <p className="sub" style={{ marginTop: 10 }}>
        Next build ({nextJob.via ?? 'spoken'}): {nextJob.title}
        {state.writeMode !== 'branch' ? ' · Coding agent paused — Autopilot will not write until Branch writes is on.' : ''}
        {state.level3Approved ? ' · Level 3 approved (branch only — you merge).' : ''}
      </p>

      <section className="section">
        <div className="section-h"><h3>Engineer cycle</h3><span>Prove improvement — don’t claim it</span></div>
        <div className="card">
          {!state.evals?.[0] ? (
            <p className="sub">No eval yet. Tap Improve cycle. I will not invent 92%.</p>
          ) : (
            <>
              <div className="list-item">
                <div className="title">{state.reports?.[0]?.summary}</div>
                <div className="sub">Vs last eval: {state.reports?.[0]?.vsPrev ?? 'insufficient'}</div>
              </div>
              {formatEval(state.evals[0]).map((line) => (
                <div key={line} className="list-item">
                  <div className="sub">{line}</div>
                </div>
              ))}
            </>
          )}
          {(state.tickets ?? []).slice(0, 6).map((t) => (
            <div key={t.id} className="list-item">
              <div className="row">
                <div>
                  <div className="title">{t.problem}</div>
                  <div className="sub">{t.improvement}</div>
                </div>
                <span className={`pill ${t.level === 3 ? 'risk' : t.level === 2 ? 'warn' : 'neutral'}`}>L{t.level} · {t.status}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-h"><h3>Findings</h3><span>Self-analysis</span></div>
        <div className="card">
          {state.findings.length === 0 ? (
            <p className="sub">Loop hasn’t reported yet — it runs on boot and every 90 seconds.</p>
          ) : (
            state.findings.map((f) => (
              <div key={f.id} className="list-item">
                <div className="row">
                  <div>
                    <div className="title">{f.title}</div>
                    <div className="sub">{f.detail}</div>
                  </div>
                  <span className={`pill ${f.status === 'open' ? (f.severity === 'critical' ? 'risk' : f.severity === 'warn' ? 'warn' : 'neutral') : 'good'}`}>
                    {f.loop} · {f.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-h"><h3>Mando, I noticed</h3><span>Initiative</span></div>
        <div className="card">
          {state.notices.length === 0 ? (
            <p className="sub">Loop will surface notices on boot.</p>
          ) : (
            state.notices.map((n) => (
              <button
                key={n.id}
                type="button"
                className="list-item"
                onClick={() => n.prompt && ask(n.prompt)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                <div className="row">
                  <div>
                    <div className="title">{n.text}</div>
                  </div>
                  <span className="pill warn">P{n.priority}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-h"><h3>Opportunities</h3><span>Scored for you</span></div>
        <div className="card">
          {state.opportunities.length === 0 ? (
            <p className="sub">Kernel scores pursue / test / wait / reject on each loop.</p>
          ) : (
            state.opportunities.map((o) => (
              <div key={o.id} className="list-item">
                <div className="row">
                  <div>
                    <div className="title">{o.title}</div>
                    <div className="sub">{o.reason} · Test: {o.test}</div>
                  </div>
                  <span className={`pill ${o.verdict === 'pursue' ? 'good' : o.verdict === 'reject' ? 'risk' : 'warn'}`}>{o.verdict}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-h"><h3>Skills</h3><span>Same skills as Cursor{wired.length ? ` · ${wired.length}` : ''}</span></div>
        <div className="card">
          {state.skills.length === 0 ? (
            <p className="sub">Empty. Kernel will wire Cursor SKILL.md files on boot.</p>
          ) : (
            <>
              {wired.length > 0 && (
                <div className="sub" style={{ marginBottom: 8 }}>Cursor-wired · name + description only — bodies stay on disk.</div>
              )}
              {state.skills.map((s) => (
                <div key={s.id} className="list-item">
                  <div className="row">
                    <div>
                      <div className="title">{s.name}</div>
                      <div className="sub">
                        {s.source === 'cursor'
                          ? (s.description || s.keywords.slice(0, 6).join(' · '))
                          : `${s.keywords.join(' · ')} · ${s.reply.slice(0, 120)}`}
                      </div>
                    </div>
                    <span className={`pill ${s.source === 'cursor' ? 'good' : 'neutral'}`}>{s.source}{s.origin ? `/${s.origin}` : ''} · {s.uses}×</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      {state.decisions?.length ? (
        <section className="section">
          <div className="section-h"><h3>Decision journal</h3><span>{state.decisions.length}</span></div>
          <div className="card">
            {state.decisions.slice(0, 4).map((d) => (
              <div key={d.id} className="list-item">
                <div className="title">{d.decision}</div>
                <div className="sub">{d.date} · {d.recommendation}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-h"><h3>From the web</h3><span>{engine}{state.lastBrowse ? ` · ${new Date(state.lastBrowse).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>
        <div className="card">
          {state.knowledge.length === 0 ? (
            <p className="sub">Empty. Say “learn about …” or paste a URL. On a fresh boot I pull one curriculum topic for your stack.</p>
          ) : (
            state.knowledge.map((k) => (
              <div key={k.id} className="list-item">
                <div className="row">
                  <div>
                    <div className="title">{k.title}</div>
                    <div className="sub">{k.takeaway}</div>
                  </div>
                  <a className="pill neutral" href={k.url} target="_blank" rel="noreferrer">Open</a>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-h">
          <h3>Kernel log</h3>
          <Cpu size={14} />
        </div>
        <div className="card">
          <ul className="activity">
            {state.activity.filter((a) => a.text.startsWith('Aria') || a.text.startsWith('Build') || a.text.startsWith('Kernel') || a.text.startsWith('Mando approved')).slice(0, 12).map((a) => (
              <li key={a.id}>{a.text}</li>
            ))}
          </ul>
          {state.cursorHistory.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="sub">Cursor runs</div>
              {state.cursorHistory.slice(0, 5).map((r) => (
                <div key={r.id} className="list-item">
                  <div className="title">{r.title}</div>
                  <div className="sub">{r.status} · {r.product} · {r.source}{r.finishedAt ? ` · ${new Date(r.finishedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
