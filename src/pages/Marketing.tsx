import { useBusiness } from '../store/BusinessProvider'
import { money } from '../lib/format'

const stageClass: Record<string, string> = {
  new: 'neutral',
  qualified: 'neutral',
  proposal: 'warn',
  negotiation: 'warn',
  won: 'good',
  lost: 'risk',
}

export function Marketing() {
  const { state, ask } = useBusiness()
  const pipe = state.leads.filter((l) => !['won', 'lost'].includes(l.stage))
  return (
    <div>
      <header className="page-head">
        <div className="kicker">Marketing Agent</div>
        <h2>Marketing</h2>
        <p>Pipeline, campaigns, and the next growth move — not a content graveyard.</p>
      </header>
      <div className="row-2">
        <div className="card">
          <div className="section-h" style={{ marginBottom: 8 }}>
            <h3>Opportunities</h3>
            <span>{money(pipe.reduce((s, l) => s + l.value, 0))}</span>
          </div>
          {state.leads.length === 0 && <p className="sub">Pipeline is empty. I will not invent prospects.</p>}
          {state.leads.map((l) => (
            <div key={l.id} className="list-item">
              <div className="row">
                <div>
                  <div className="title">{l.company}</div>
                  <div className="sub">{l.contact} · {l.source} · {l.nextStep}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="title">{money(l.value)}</div>
                  <span className={`pill ${stageClass[l.stage]}`}>{l.stage}</span>
                </div>
              </div>
            </div>
          ))}
          {state.leads.length > 0 && (
            <button type="button" className="solid" style={{ marginTop: 12 }} onClick={() => ask('Send a proposal')}>
              Draft proposal
            </button>
          )}
        </div>
        <div className="card">
          <h3 className="section-h" style={{ marginBottom: 8 }}>Campaigns</h3>
          {state.campaigns.length === 0 && <p className="sub">No campaigns yet. Live Paidly and BrandCafé CTAs land here after sync.</p>}
          {state.campaigns.map((c) => (
            <div key={c.id} className="list-item">
              <div className="title">{c.name}</div>
              <div className="sub">{c.channel} · {c.status} · {c.performance}{c.spend ? ` · ${money(c.spend)} spend` : ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
