import { useEffect, useState } from 'react'
import { useBusiness } from '../store/BusinessProvider'
import { browserHealth, type BrowserHealth } from '../engine/browser'

export function Systems() {
  const { state, refreshLive } = useBusiness()
  const [browser, setBrowser] = useState<BrowserHealth>({ ok: false, google: false, openai: false, cursor: false, code: false, cursorSkills: 0, engine: 'down' })

  useEffect(() => {
    void browserHealth().then(setBrowser)
  }, [])

  const systems = [
    { name: 'Clients', status: 'connected', detail: `${state.clients.length} organisations from live BrandCafé (portfolio, not a chase list until you add emails)` },
    { name: 'Projects', status: 'connected', detail: `${state.projects.length} products/projects · briefs from the public sites` },
    { name: 'Tasks', status: 'connected', detail: state.tasks.length ? `Board + today list · ${state.tasks.length} items` : 'Board empty — add real work' },
    { name: 'Invoices', status: 'connected', detail: state.invoices.length ? 'Local ledger' : 'Empty · Paidly login/API later — not the marketing mock' },
    { name: 'Emails', status: 'connected', detail: 'Draft → approve → outbox (this device)' },
    { name: 'Documents', status: 'connected', detail: state.documents.length ? `${state.documents.length} on file` : 'Empty until live sync' },
    { name: 'Calendar', status: 'connected', detail: state.events.length ? `${state.events.length} items` : 'Empty' },
    { name: 'CRM', status: 'connected', detail: `${state.leads.filter((l) => !['won', 'lost'].includes(l.stage)).length} opportunities in pipeline` },
    { name: 'Analytics', status: 'soon', detail: 'Campaign performance will sit here' },
    {
      name: 'Google Custom Search',
      status: browser.google ? 'connected' : 'soon',
      detail: browser.google
        ? 'Primary search · gl=za · API key stays on the server'
        : 'Add GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX to .env, then restart Vite',
    },
    {
      name: 'ChatGPT',
      status: browser.openai ? 'connected' : 'soon',
      detail: browser.openai
        ? 'gpt-4o-mini · chat, research, and Autopilot briefs · key stays on the server'
        : 'Add OPENAI_API_KEY to .env, then restart Vite',
    },
    {
      name: 'Browser',
      status: browser.ok ? 'connected' : 'soon',
      detail: browser.ok
        ? `Read pages · engine ${browser.engine} · takeaways become skills`
        : 'Dev server proxy is down',
    },
    {
      name: 'Cursor SDK',
      status: browser.cursor ? 'connected' : 'soon',
      detail: browser.cursor
        ? 'Local agents · Aria can write code in this workspace · key stays on the server'
        : 'Add CURSOR_API_KEY to .env (Cursor Dashboard → Integrations), then restart Vite',
    },
    {
      name: 'Repo literacy',
      status: browser.code ? 'connected' : 'soon',
      detail: browser.code
        ? 'Map / grep / read src and plugins. She explains from files, then ships bounded Cursor jobs. Never .env.'
        : 'Restart Vite so /__aria/code comes up',
    },
    { name: 'Founder OS', status: 'connected', detail: 'Armando profile — cash first, then commitments, then assets' },
    {
      name: 'BrandCafé',
      status: state.lastLiveSync ? 'connected' : 'soon',
      detail: state.lastLiveSync
        ? `Live ${state.company.brandCafeUrl} · last sync ${new Date(state.lastLiveSync).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`
        : `Waiting to read ${state.company.brandCafeUrl}`,
    },
    {
      name: 'Paidly',
      status: state.lastLiveSync ? 'connected' : 'soon',
      detail: state.lastLiveSync
        ? `Live ${state.company.paidlyUrl} · public pricing and product, not the login ledger`
        : `Waiting to read ${state.company.paidlyUrl}`,
    },
  ]

  return (
    <div>
      <header className="page-head">
        <div className="kicker">Platform</div>
        <h2>Systems</h2>
        <p>
          {state.company.name} runs on {state.company.assistantName}. She sits above these systems — she does not replace them.
        </p>
      </header>
      <div className="alert-actions" style={{ marginBottom: 16 }}>
        <button type="button" className="solid" onClick={() => void refreshLive()}>Sync live sites</button>
      </div>
      <div className="card">
        {systems.map((s) => (
          <div key={s.name} className="sys">
            <div className="left">
              <span className={`dot ${s.status === 'soon' ? 'off' : ''}`} />
              <div>
                <div className="title">{s.name}</div>
                <div className="sub">{s.detail}</div>
              </div>
            </div>
            <span className={`pill ${s.status === 'connected' ? 'good' : 'neutral'}`}>
              {s.status === 'connected' ? 'Live' : 'Later'}
            </span>
          </div>
        ))}
      </div>
      <section className="section">
        <div className="section-h">
          <h3>Build list</h3>
          <span>Spoken and typed notes that grow this OS</span>
        </div>
        <div className="card">
          {state.roadmap.length === 0 ? (
            <p className="sub">Empty. On Command, tap Live and say “add a feature…” or “I want you to build…”</p>
          ) : (
            state.roadmap.map((n) => (
              <div key={n.id} className="list-item">
                <div className="title">{n.text}</div>
                <div className="sub">{new Date(n.at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
