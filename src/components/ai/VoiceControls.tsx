import { Mic, MicOff, Radio, Volume2 } from 'lucide-react'
import { useVoice } from '../../store/VoiceProvider'
import { useBusiness } from '../../store/BusinessProvider'

export function VoiceControls({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { supported, status, live, error, ttsError, interim, heard, toggleListen, toggleLive, hearNow } = useVoice()
  const name = useBusiness().state.company.assistantName
  const listening = status === 'listening'
  const speaking = status === 'speaking'
  const thinking = status === 'thinking'
  const line =
    error ??
    (speaking ? `${name} speaking… tap mic to interrupt` :
      ttsError ? ttsError :
      !supported ? 'Mic needs Chrome, Edge, or Safari. Speaker still works — tap Hear Aria.' :
      listening && interim ? `Heard: “${interim}”` :
      listening ? `Listening… talk naturally` :
      thinking ? `Working on what you said${heard ? ` — “${heard}”` : '…'}` :
      live ? `Live — keep talking. Say “${name}” if I go quiet.` :
      `Tap Hear Aria once so I can use the speaker. Then mic or Live.`)
  return (
    <div className={`voice-controls ${size}`}>
      {supported && (
        <button
          type="button"
          className={`mic ${listening ? 'hot' : ''} ${speaking ? 'talk' : ''} ${thinking ? 'think' : ''}`}
          onClick={toggleListen}
          aria-pressed={listening || thinking}
          aria-label={listening ? 'Send what I heard' : speaking ? `Interrupt ${name}` : `Talk to ${name}`}
          title={listening ? 'Tap again to send' : speaking ? 'Interrupt' : `Talk to ${name}`}
        >
          {listening ? <MicOff size={size === 'lg' ? 22 : 18} /> : <Mic size={size === 'lg' ? 22 : 18} />}
        </button>
      )}
      {supported && (
        <button
          type="button"
          className={`live-btn ${live ? 'on' : ''}`}
          onClick={toggleLive}
          aria-pressed={live}
          title="Hands-free conversation"
        >
          <Radio size={14} />
          {live ? 'Live on' : 'Live'}
        </button>
      )}
      <button type="button" className="live-btn" onClick={hearNow} title="Test speakers">
        <Volume2 size={14} />
        Hear Aria
      </button>
      <span className="voice-status">{line}</span>
    </div>
  )
}
