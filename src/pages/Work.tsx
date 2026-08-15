import { useBusiness } from '../store/BusinessProvider'
import { clientById, personById, tasksDueToday } from '../engine/insights'
import { fmtDateShort } from '../lib/format'

const COLS: { key: 'backlog' | 'progress' | 'review' | 'done'; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'progress', label: 'In progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]

export function Work() {
  const { state } = useBusiness()
  const today = tasksDueToday(state)
  const events = [...state.events].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  return (
    <div>
      <header className="page-head">
        <div className="kicker">Project Agent · diary</div>
        <h2>Work</h2>
        <p>{today.length} tasks due today. Calendar is the constraint, not the kanban.</p>
      </header>

      <section className="section" style={{ marginTop: 0 }}>
        <div className="section-h"><h3>Today</h3></div>
        <div className="card">
          {today.length === 0 && <p className="sub">Nothing due today. The board is empty until you add real work.</p>}
          {today.map((t) => (
            <div key={t.id} className="list-item">
              <div className="row">
                <div>
                  <div className="title">{t.title}</div>
                  <div className="sub">{personById(state, t.assigneeId)?.name}{t.clientId ? ` · ${clientById(state, t.clientId)?.name}` : ''}</div>
                </div>
                <span className={`prio ${t.priority}`}>{t.priority}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-h"><h3>Board</h3></div>
        <div className="kanban">
          {COLS.map((col) => {
            const cards = state.tasks.filter((t) => t.status === col.key)
            return (
              <div key={col.key} className="card kcol">
                <div className="kcol-h">{col.label}<span>{cards.length}</span></div>
                {cards.length === 0 && <p className="sub">Empty</p>}
                {cards.map((t) => (
                  <div key={t.id} className="kcard">
                    <span className={`prio ${t.priority}`}>{t.priority}</span>
                    <div className="kt">{t.title}</div>
                    <div className="km">
                      <span>{fmtDateShort(t.due)}</span>
                      <span>{personById(state, t.assigneeId)?.name.split(' ')[0]}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-h"><h3>Calendar</h3></div>
        <div className="row-2">
          <div className="cal">
            {events.length === 0 && <p className="sub">No calendar items.</p>}
            {events.map((e) => (
              <div key={e.id} className="cal-row">
                <div>
                  <div className="t">{e.time}</div>
                  <div className="muted">{fmtDateShort(e.date)}</div>
                </div>
                <div>
                  <div className="title">{e.title}</div>
                  <div className="sub">{e.kind}{e.clientId ? ` · ${clientById(state, e.clientId)?.name}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <h4 style={{ fontSize: 13, marginBottom: 12 }}>Capacity</h4>
            {state.people.map((p) => (
              <div key={p.id} className="list-item">
                <div className="row">
                  <div>
                    <div className="title">{p.name}</div>
                    <div className="sub">{p.role} · {p.focus}</div>
                  </div>
                  <span className={p.load > p.capacity ? 'prio high' : 'muted'}>{p.load}%</span>
                </div>
                <div className={`load ${p.load > p.capacity ? 'over' : ''}`}><i style={{ width: `${Math.min(p.load, 140)}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
