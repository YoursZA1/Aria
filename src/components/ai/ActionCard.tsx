import type { ProposedAction } from '../../types'
import type { Email } from '../../types'

export function ActionCard({
  action,
  busy,
  onPrimary,
  onSecondary,
}: {
  action: ProposedAction
  busy?: boolean
  onPrimary: () => void
  onSecondary?: () => void
}) {
  const emails = action.payload.emails as Email[] | undefined
  const done = action.status === 'done'
  const dismissed = action.status === 'dismissed'
  return (
    <div className={`action-card ${done ? 'done' : ''} ${dismissed ? 'dismissed' : ''}`}>
      <h4>{action.label}</h4>
      <p>{done ? 'Done.' : dismissed ? 'Dismissed.' : action.description}</p>
      {emails && emails.length > 0 && !done && (
        <div className="email-preview">
          {emails.map((e) => `To: ${e.toName} <${e.to}>\n${e.subject}\n\n${e.body}`).join('\n\n———\n\n')}
        </div>
      )}
      {!done && !dismissed && (
        <div className="action-row" style={{ marginTop: emails ? 10 : 0 }}>
          <button type="button" className="solid" disabled={busy} onClick={onPrimary}>
            {action.kind === 'send_emails' ? 'Send' : action.label}
          </button>
          {action.secondaryLabel && (
            <button type="button" className="ghost" disabled={busy} onClick={onSecondary}>
              {action.secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
