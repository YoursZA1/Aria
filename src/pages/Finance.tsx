import { useBusiness } from '../store/BusinessProvider'
import { clientById, monthRevenue, overdueInvoices, overdueTotal, outstandingTotal } from '../engine/insights'
import { goalProgress } from '../engine/goal'
import { fmtDate, money } from '../lib/format'

const invClass: Record<string, string> = {
  paid: 'good',
  sent: 'neutral',
  overdue: 'risk',
  draft: 'warn',
}

export function Finance() {
  const { state, ask } = useBusiness()
  const rev = monthRevenue(state)
  const pct = state.company.monthTarget ? Math.round((rev / state.company.monthTarget) * 100) : 0
  const sent = state.emails.filter((e) => e.status === 'sent')
  const goal = goalProgress(state)

  return (
    <div>
      <header className="page-head">
        <div className="kicker">Finance Agent</div>
        <h2>Finance</h2>
        <p>Cash, invoices, and the climb from R0 to R1 million collected — not homepage mock numbers.</p>
      </header>
      <div className="insight-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className={`insight ${goal.empty ? 'warn' : goal.collected >= goal.amount ? 'good' : 'neutral'}`}>
          <div className="area">R0 → R1m</div>
          <div className="value">{money(goal.collected)}</div>
          <div className="hint">{goal.empty ? '0% · ledger empty until Paidly login' : `${goal.pct}% of ${money(goal.amount)} · next ${money(goal.next)}`}</div>
        </div>
        <div className="insight good"><div className="area">Revenue MTD</div><div className="value">{money(rev)}</div><div className="hint">{state.company.monthTarget ? `${pct}% of ${money(state.company.monthTarget)}` : 'No month target — ledger empty'}</div></div>
        <div className="insight risk"><div className="area">Overdue</div><div className="value">{money(overdueTotal(state))}</div><div className="hint">{overdueInvoices(state).length} clients past terms</div></div>
        <div className="insight warn"><div className="area">Outstanding</div><div className="value">{money(outstandingTotal(state))}</div><div className="hint">Includes not-yet-due</div></div>
        <div className="insight"><div className="area">Retainers</div><div className="value">{money(state.clients.reduce((s, c) => s + c.retainer, 0))}</div><div className="hint">Monthly contracted</div></div>
      </div>

      <section className="section">
        <div className="section-h">
          <h3>Invoices</h3>
          <button type="button" className="ghost" onClick={() => ask("Which clients haven't paid?")}>Ask finance agent</button>
        </div>
        <div className="card">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Client</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {state.invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="sub">Empty ledger. Paidly’s homepage mock (Highveld, Brightleaf) is not your books. Connect Paidly login for real receivables.</td>
                </tr>
              )}
              {state.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.number}{inv.remindedAt ? <div className="muted">Reminded</div> : null}</td>
                  <td>{clientById(state, inv.clientId)?.name}</td>
                  <td>{fmtDate(inv.issued)}</td>
                  <td>{fmtDate(inv.due)}</td>
                  <td><span className={`pill ${invClass[inv.status]}`}>{inv.status}</span></td>
                  <td className="num">{money(inv.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {sent.length > 0 && (
        <section className="section">
          <div className="section-h"><h3>Outbox</h3><span>Sent from this assistant</span></div>
          <div className="card">
            {sent.map((e) => (
              <div key={e.id} className="list-item">
                <div className="title">{e.subject}</div>
                <div className="sub">{e.toName} · {e.to} · {e.purpose.replace('_', ' ')}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
