import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { interpretHeard } from '../lib/hear'
import { getAnalyser, getSpeechRecognition, resumeAudio, silence, speak, spokenFrom, unlockAudio, warmVoices, type SpeechRec } from '../lib/speech'
import { useBusiness } from './BusinessProvider'

export type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

type VoiceApi = {
  supported: boolean
  status: VoiceStatus
  live: boolean
  interim: string
  heard: string
  error: string | null
  ttsError: string | null
  energy: number
  toggleListen: () => void
  toggleLive: () => void
  hearNow: () => void
  stop: () => void
}

const Ctx = createContext<VoiceApi | null>(null)
const SILENCE_MS = 850
const FLOOR_MS = 18_000

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { ask, state } = useBusiness()
  const supported = typeof window !== 'undefined' && !!getSpeechRecognition()
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [live, setLive] = useState(false)
  const [interim, setInterim] = useState('')
  const [heard, setHeard] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [energy, setEnergy] = useState(0)
  const recRef = useRef<SpeechRec | null>(null)
  const liveRef = useRef(false)
  const armedRef = useRef(false)
  const openFloorRef = useRef(false)
  const lastSpokenKey = useRef<string | null>(null)
  const session = useRef(0)
  const startRecRef = useRef<() => void>(() => undefined)
  const flushRef = useRef<() => void>(() => undefined)
  const energyRef = useRef(0)
  const talkingRef = useRef(false)
  const bufRef = useRef('')
  const silenceTimer = useRef(0)
  const floorTimer = useRef(0)
  const name = state.company.assistantName || 'Aria'

  liveRef.current = live

  const killRec = useCallback(() => {
    session.current += 1
    window.clearTimeout(silenceTimer.current)
    try { recRef.current?.abort() } catch { /* ignore */ }
    recRef.current = null
  }, [])

  const openFloor = useCallback((ms = FLOOR_MS) => {
    openFloorRef.current = true
    window.clearTimeout(floorTimer.current)
    floorTimer.current = window.setTimeout(() => {
      openFloorRef.current = false
    }, ms)
  }, [])

  const finishTalk = useCallback(() => {
    talkingRef.current = false
    energyRef.current = 0
    setEnergy(0)
    armedRef.current = false
    setStatus('idle')
    openFloor()
    if (liveRef.current) startRecRef.current()
  }, [openFloor])

  const flush = useCallback(() => {
    window.clearTimeout(silenceTimer.current)
    const raw = bufRef.current.trim()
    bufRef.current = ''
    setInterim('')
    if (!raw) return
    const result = interpretHeard(raw, name, {
      live: liveRef.current,
      openFloor: openFloorRef.current || !liveRef.current,
    })
    if (result.kind === 'noise') {
      if (liveRef.current && recRef.current) return
      return
    }
    if (result.kind === 'stop') {
      setHeard('stop')
      silence()
      talkingRef.current = false
      setLive(false)
      liveRef.current = false
      killRec()
      setStatus('idle')
      return
    }
    armedRef.current = true
    setHeard(result.kind === 'wake' ? name : result.text)
    killRec()
    setStatus('thinking')
    if (result.kind === 'wake') void ask(name, { voice: true })
    else void ask(result.text, { voice: true })
  }, [ask, killRec, name])

  flushRef.current = flush

  const startRec = useCallback(() => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      setError('Voice needs Chrome, Edge, or Safari.')
      return
    }
    killRec()
    const mine = session.current
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-GB'
    rec.onresult = (ev) => {
      if (mine !== session.current) return
      if (talkingRef.current) {
        silence()
        talkingRef.current = false
        openFloorRef.current = true
        armedRef.current = true
      }
      let finalText = ''
      let liveText = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const piece = ev.results[i][0].transcript
        const conf = ev.results[i][0].confidence
        if (ev.results[i].isFinal) {
          if (conf !== undefined && conf < 0.35) continue
          finalText += piece
        } else liveText += piece
      }
      if (finalText.trim()) {
        bufRef.current = `${bufRef.current} ${finalText}`.replace(/\s+/g, ' ').trim()
      }
      const preview = `${bufRef.current} ${liveText}`.replace(/\s+/g, ' ').trim()
      if (preview) setInterim(preview)
      if (bufRef.current || liveText.trim().length > 2) {
        window.clearTimeout(silenceTimer.current)
        silenceTimer.current = window.setTimeout(() => {
          if (mine !== session.current) return
          flushRef.current()
        }, SILENCE_MS)
      }
    }
    rec.onerror = (ev) => {
      if (mine !== session.current) return
      if (ev.error === 'not-allowed') {
        setError('Microphone permission blocked. Allow it in the browser, then tap the mic.')
        setLive(false)
        liveRef.current = false
        setStatus('idle')
        return
      }
      if (ev.error === 'no-speech' || ev.error === 'aborted') return
      setError(ev.error)
    }
    rec.onend = () => {
      if (mine !== session.current) return
      recRef.current = null
      if (bufRef.current) {
        flushRef.current()
        return
      }
      if (liveRef.current && !talkingRef.current) {
        window.setTimeout(() => {
          if (liveRef.current && mine === session.current && !talkingRef.current) startRecRef.current()
        }, 220)
      } else {
        setStatus((s) => (s === 'listening' ? 'idle' : s))
      }
    }
    recRef.current = rec
    try {
      rec.start()
      setStatus('listening')
      setError(null)
    } catch {
      setError('Could not start the microphone.')
      setStatus('idle')
    }
  }, [killRec])

  startRecRef.current = startRec

  const last = state.messages.filter((m) => m.role === 'assistant').at(-1)
  const lastId = last?.id
  const lastIntent = last?.intent
  const lastText = last?.text
  const hearReplies = useRef(false)

  useEffect(() => {
    if (!last) return
    const waiting =
      last.intent === 'researching' ||
      last.intent === 'planning' ||
      last.intent === 'building' ||
      last.intent === 'thinking'
    const fromVoice = armedRef.current || liveRef.current || hearReplies.current
    if (waiting) {
      lastSpokenKey.current = `${last.id}:wait`
      if (fromVoice) setStatus('thinking')
      return
    }
    const key = `${last.id}:done`
    if (lastSpokenKey.current === key) return
    if (!fromVoice) {
      lastSpokenKey.current = key
      return
    }
    lastSpokenKey.current = key
    killRec()
    talkingRef.current = true
    energyRef.current = 0.55
    setEnergy(0.55)
    setStatus('speaking')
    setTtsError(null)
    const labels = last.actions?.filter((a) => a.status === 'proposed').map((a) => a.label)
    void speak(spokenFrom(last.text, last.bullets, labels), {
      onStart: () => setStatus('speaking'),
      onBoundary: () => {
        energyRef.current = 1
        setEnergy(1)
      },
      onEnd: finishTalk,
    }).then((result) => {
      if (!result.ok) {
        setTtsError(result.error ?? 'I could not speak. Unmute this tab and tap Hear Aria.')
        finishTalk()
      }
    })
  }, [last, lastId, lastIntent, lastText, killRec, finishTalk])

  useEffect(() => {
    let raf = 0
    const tick = (now: number) => {
      const t = now / 1000
      const node = getAnalyser()
      if (talkingRef.current && node) {
        const data = new Uint8Array(node.fftSize)
        node.getByteTimeDomainData(data)
        let sum = 0
        for (const s of data) {
          const v = (s - 128) / 128
          sum += v * v
        }
        const rms = Math.min(1, Math.sqrt(sum / data.length) * 4.2)
        energyRef.current = Math.max(0.18, rms)
        setEnergy(energyRef.current)
      } else if (talkingRef.current) {
        const wave =
          0.28 +
          0.42 * Math.abs(Math.sin(t * 14.2)) +
          0.22 * Math.abs(Math.sin(t * 31.6)) * Math.abs(Math.sin(t * 5.4))
        energyRef.current = Math.max(energyRef.current * 0.82, wave)
        setEnergy(energyRef.current)
      } else if (energyRef.current > 0.01) {
        energyRef.current *= 0.9
        setEnergy(energyRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    warmVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', warmVoices)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', warmVoices)
  }, [])

  useEffect(() => () => {
    window.clearTimeout(silenceTimer.current)
    window.clearTimeout(floorTimer.current)
    killRec()
    silence()
  }, [killRec])

  const toggleListen = useCallback(() => {
    hearReplies.current = true
    void unlockAudio()
    resumeAudio()
    setTtsError(null)
    if (talkingRef.current) {
      silence()
      talkingRef.current = false
      openFloor()
      armedRef.current = true
      startRec()
      return
    }
    if (recRef.current) {
      if (bufRef.current.trim()) {
        flush()
        return
      }
      killRec()
      setStatus('idle')
      return
    }
    openFloor()
    armedRef.current = true
    startRec()
  }, [flush, killRec, openFloor, startRec])

  const toggleLive = useCallback(() => {
    hearReplies.current = true
    void unlockAudio()
    resumeAudio()
    setLive((on) => {
      const next = !on
      liveRef.current = next
      if (next) {
        openFloor()
        armedRef.current = true
        talkingRef.current = true
        setStatus('speaking')
        setTtsError(null)
        void speak("I'm listening.", {
          onStart: () => setStatus('speaking'),
          onEnd: () => {
            talkingRef.current = false
            startRecRef.current()
          },
        }).then((result) => {
          if (!result.ok) {
            setTtsError(result.error ?? 'I could not speak. Unmute this tab and tap Hear Aria.')
            talkingRef.current = false
            startRecRef.current()
          }
        })
      } else {
        talkingRef.current = false
        energyRef.current = 0
        setEnergy(0)
        killRec()
        silence()
        setStatus('idle')
      }
      return next
    })
  }, [killRec, openFloor])

  const hearNow = useCallback(() => {
    hearReplies.current = true
    void unlockAudio()
    resumeAudio()
    setTtsError(null)
    talkingRef.current = true
    setStatus('speaking')
    const nameNow = name
    void speak(`Yes, Mando. I’m ${nameNow}. You should hear me now.`, {
      onStart: () => setStatus('speaking'),
      onEnd: finishTalk,
    }).then((result) => {
      if (!result.ok) {
        setTtsError(result.error ?? 'This tab is muted, or the browser blocked sound. Unmute, then tap Hear Aria again.')
        finishTalk()
      }
    })
  }, [finishTalk, name])

  const stop = useCallback(() => {
    setLive(false)
    liveRef.current = false
    talkingRef.current = false
    energyRef.current = 0
    setEnergy(0)
    bufRef.current = ''
    killRec()
    silence()
    setStatus('idle')
    setInterim('')
  }, [killRec])

  const api = useMemo<VoiceApi>(
    () => ({ supported, status, live, interim, heard, error, ttsError, energy, toggleListen, toggleLive, hearNow, stop }),
    [supported, status, live, interim, heard, error, ttsError, energy, toggleListen, toggleLive, hearNow, stop],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useVoice() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useVoice must be used inside VoiceProvider')
  return ctx
}
