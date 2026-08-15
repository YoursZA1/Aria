import { useBusiness } from '../store/BusinessProvider'
import { clientById } from '../engine/insights'
import { fmtDate } from '../lib/format'

export function Creative() {
  const { state, ask } = useBusiness()
  return (
    <div>
      <header className="page-head">
        <div className="kicker">Creative Agent</div>
        <h2>Creative</h2>
        <p>Brand kits and briefs pulled from BrandCafé and Paidly — not invented twice.</p>
      </header>
      <div className="row-3">
        {state.brands.length === 0 && (
          <article className="card">
            <p className="sub">No brand kits yet. Sync the live sites and I’ll pull BrandCafé and Paidly voice from the pages.</p>
          </article>
        )}
        {state.brands.map((b) => {
          const client = clientById(state, b.clientId)
          const project = state.projects.find((p) => p.clientId === b.clientId)
          return (
            <article key={b.id} className="card">
              <div className="muted">{client?.name}</div>
              <h3 className="title" style={{ marginTop: 4, fontSize: 16 }}>{project?.name.replace(/^.* — /, '') ?? 'Brand'}</h3>
              <div className="swatches">
                {b.colors.map((c) => (
                  <span key={c} className="swatch" style={{ background: c }} title={c} />
                ))}
              </div>
              <p className="sub" style={{ lineHeight: 1.45 }}>{b.voice}</p>
              <p className="sub" style={{ marginTop: 8 }}>{b.typefaces.join(' + ')}</p>
              <p className="sub" style={{ marginTop: 8, lineHeight: 1.45 }}>{b.direction}</p>
              {project && <p className="sub" style={{ marginTop: 12, lineHeight: 1.45 }}>{project.brief}</p>}
              <button type="button" className="ghost" style={{ marginTop: 12 }} onClick={() => ask(`Show me the ${client?.name} brand and brief`)}>
                Ask creative agent
              </button>
            </article>
          )
        })}
      </div>
      <section className="section">
        <div className="section-h"><h3>Documents</h3></div>
        <div className="card">
          {state.documents.length === 0 && <p className="sub">No documents on file.</p>}
          {state.documents.map((d) => (
            <div key={d.id} className="list-item">
              <div className="row">
                <div>
                  <div className="title">{d.title}</div>
                  <div className="sub">{d.kind}{d.clientId ? ` · ${clientById(state, d.clientId)?.name}` : ''}</div>
                </div>
                <span className="muted">{fmtDate(d.updated)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
