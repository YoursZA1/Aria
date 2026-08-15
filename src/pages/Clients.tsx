import { useBusiness } from '../store/BusinessProvider'
import { fmtDateShort } from '../lib/format'

const healthClass = { healthy: 'good', watch: 'warn', risk: 'risk' } as const

export function Clients() {
  const { state, ask } = useBusiness()
  return (
    <div>
      <header className="page-head">
        <div className="kicker">Client Agent</div>
        <h2>Clients</h2>
        <p>Health, feedback blockers, and last contact — the relationship layer the AI reads.</p>
      </header>
      <div className="row-3">
        {state.clients.length === 0 && (
          <article className="card">
            <p className="sub">No organisations yet. After a live sync, names that appear on brand-cafe.co.za show here. They are portfolio, not a chase list, until you add emails.</p>
          </article>
        )}
        {state.clients.map((c) => (
          <article key={c.id} className="card">
            <div className="row">
              <div>
                <div className="title">{c.name}</div>
                <div className="sub">{c.contact} · {c.industry}</div>
              </div>
              <span className={`pill ${healthClass[c.health]}`}>{c.health}</span>
            </div>
            <p className="sub" style={{ marginTop: 10, lineHeight: 1.45 }}>{c.notes}</p>
            <div className="sub" style={{ marginTop: 10 }}>Last contact {fmtDateShort(c.lastContact)} · {c.awaitingFeedback ? 'Awaiting feedback' : c.status}</div>
            <div className="action-row" style={{ marginTop: 12 }}>
              <button type="button" className="ghost" onClick={() => ask(`Follow up with ${c.name}`)}>
                Follow up
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
