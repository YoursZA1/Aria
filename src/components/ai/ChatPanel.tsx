import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PanelRightClose } from 'lucide-react'
import { AGENTS } from '../../data/seed'
import { useBusiness } from '../../store/BusinessProvider'
import { ActionCard } from './ActionCard'
import { VoiceControls } from './VoiceControls'
import { useVoice } from '../../store/VoiceProvider'

export function ChatPanel({ onCollapse }: { onCollapse: () => void }) {
  const { state, ask, runAction, setAgent } = useBusiness()
  const { interim, status } = useVoice()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const nav = useNavigate()

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.messages.length])

  async function submit(text = value) {
    if (!text.trim() || busy) return
    setBusy(true)
    setValue('')
    try {
      await ask(text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="ai-panel">
      <div className="ai-head">
        <div>
          <h3>{state.company.assistantName}</h3>
          <p>
            {state.cursorRun && (state.cursorRun.status === 'running' || state.cursorRun.status === 'queued')
              ? `I’m in Cursor building “${state.cursorRun.title}”.`
              : `Call me ${state.company.assistantName}. Executive assistant — concise, direct. Autopilot ${state.autopilot ? 'on' : 'off'} · writes ${state.writeMode === 'branch' ? 'on' : 'paused'}${state.level3Approved ? ' · L3 on' : ''}.`}
          </p>
        </div>
        <button type="button" className="ghost" onClick={onCollapse} aria-label="Collapse assistant">
          <PanelRightClose size={16} />
        </button>
      </div>
      <div className="agents">
        <button type="button" className={`agent ${state.selectedAgent === 'auto' ? 'on' : ''}`} onClick={() => setAgent('auto')}>
          Auto
        </button>
        {AGENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`agent ${state.selectedAgent === a.id ? 'on' : ''}`}
            onClick={() => setAgent(a.id)}
            title={a.blurb}
          >
            {a.name}
          </button>
        ))}
      </div>
      <div className="messages">
        {state.messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="bubble">
              {m.role === 'assistant' && m.agentId && (
                <div className="agent-label">{AGENTS.find((a) => a.id === m.agentId)?.title}</div>
              )}
              {m.text}
              {m.bullets && m.bullets.length > 0 && (
                <ul>
                  {m.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {m.actions?.map((a) => (
                <ActionCard
                  key={a.id}
                  action={a}
                  busy={busy}
                  onPrimary={() => {
                    setBusy(true)
                    const href = runAction(m.id, a, 'primary')
                    if (href) nav(href)
                    window.setTimeout(() => setBusy(false), 240)
                  }}
                  onSecondary={() => {
                    const href = runAction(m.id, a, 'secondary')
                    if (href) nav(href)
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          value={status === 'listening' || status === 'thinking' ? interim || value : value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status === 'listening' ? 'Listening… speak naturally' : `${state.company.assistantName}, what should I handle?`}
          aria-label="Ask the business assistant"
        />
        <button type="submit" className="solid" disabled={busy || !value.trim()}>
          {busy ? '…' : 'Go'}
        </button>
      </form>
      <div className="voice-dock">
        <VoiceControls />
      </div>
    </aside>
  )
}
