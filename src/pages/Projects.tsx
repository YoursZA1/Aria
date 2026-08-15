import { useBusiness } from '../store/BusinessProvider'
import { clientById, personById } from '../engine/insights'
import { fmtDate } from '../lib/format'

const statusClass: Record<string, string> = {
  production: 'warn',
  review: 'neutral',
  brief: 'neutral',
  live: 'good',
  paused: 'risk',
}

export function Projects() {
  const { state, ask } = useBusiness()
  return (
    <div>
      <header className="page-head">
        <div className="kicker">Project Agent</div>
        <h2>Projects</h2>
        <p>Products and delivery from the live BrandCafé site — not a fictional studio board.</p>
      </header>
      <div className="row-2">
        {state.projects.length === 0 && (
          <article className="card">
            <p className="sub">No projects yet. Sync brand-cafe.co.za and I’ll pull products that actually appear on the page.</p>
          </article>
        )}
        {state.projects.map((p) => {
          const client = clientById(state, p.clientId)
          const owner = personById(state, p.ownerId)
          return (
            <article key={p.id} className="card">
              <div className="row">
                <div>
                  <div className="muted">{client?.name}</div>
                  <div className="title" style={{ marginTop: 4 }}>{p.name.replace(/^.* — /, '')}</div>
                </div>
                <span className={`pill ${statusClass[p.status] ?? 'neutral'}`}>{p.status}</span>
              </div>
              <p className="sub" style={{ marginTop: 10, lineHeight: 1.45 }}>{p.brief}</p>
              <div className="sub" style={{ marginTop: 10 }}>
                Due {fmtDate(p.due)} · {owner?.name} {p.daysBehind > 0 ? `· ${p.daysBehind}d behind` : ''}
              </div>
              {p.bottleneck && <p className="sub" style={{ marginTop: 8, color: 'var(--warning)' }}>{p.bottleneck}</p>}
              <div className="chips" style={{ marginTop: 10 }}>
                {p.deliverables.map((d) => (
                  <span key={d} className="chip" style={{ cursor: 'default' }}>{d}</span>
                ))}
              </div>
              {p.daysBehind > 0 && (
                <button type="button" className="solid" style={{ marginTop: 14 }} onClick={() => ask('What is blocking production?')}>
                  Handle delay
                </button>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
