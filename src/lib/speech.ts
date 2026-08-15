import { forVoice } from './hear'

export type SpeechRec = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: SpeechRecEvent) => void) | null
  onend: (() => void) | null
  onerror: ((ev: { error: string }) => void) | null
}

type SpeechRecEvent = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence?: number } }>
}

type RecCtor = new () => SpeechRec

export type SpeakHooks = {
  onStart?: () => void
  onEnd?: () => void
  onBoundary?: () => void
}

export type SpeakResult = {
  ok: boolean
  engine: 'neural' | 'browser' | null
  error?: string
}

let speakGen = 0
let neuralAudio: HTMLAudioElement | null = null
let heldUtterance: SpeechSynthesisUtterance | null = null
let audioCtx: AudioContext | null = null
let voicesReady: SpeechSynthesisVoice[] = []
let speakerEl: HTMLAudioElement | null = null
let neuralSkipUntil = 0

type RecCtorWindow = Window & { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function speaker(): HTMLAudioElement {
  if (!speakerEl) {
    speakerEl = new Audio()
    speakerEl.preload = 'auto'
    ;(speakerEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    speakerEl.setAttribute('playsinline', 'true')
    speakerEl.setAttribute('webkit-playsinline', 'true')
  }
  speakerEl.muted = false
  speakerEl.volume = 1
  return speakerEl
}

export function getSpeechRecognition(): RecCtor | null {
  const w = window as RecCtorWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function warmVoices(): void {
  if (!window.speechSynthesis) return
  voicesReady = window.speechSynthesis.getVoices()
}

export function pickVoice(): SpeechSynthesisVoice | null {
  const voices = voicesReady.length ? voicesReady : window.speechSynthesis?.getVoices() ?? []
  const rank = [
    /google uk english female/i,
    /microsoft (aria|jenny|sonia|libby|sara)/i,
    /google us english female/i,
    /samantha/i,
    /karen/i,
    /moira/i,
    /tessa/i,
    /serena/i,
    /zira/i,
    /female/i,
  ]
  for (const rx of rank) {
    const hit = voices.find((v) => rx.test(v.name) && /^en/i.test(v.lang))
    if (hit) return hit
  }
  return voices.find((v) => /^en-GB/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang)) ?? voices[0] ?? null
}

/** Playback goes through the HTML audio element, not Web Audio — analyser is unused. */
export function getAnalyser(): AnalyserNode | null {
  return null
}

export function silence(): void {
  speakGen += 1
  heldUtterance = null
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
  if (neuralAudio) {
    try {
      neuralAudio.onended = null
      neuralAudio.onerror = null
      neuralAudio.pause()
      neuralAudio.removeAttribute('src')
      neuralAudio.load()
    } catch {
      /* ignore */
    }
    neuralAudio = null
  }
}

function ensureCtx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    return audioCtx
  } catch {
    return null
  }
}

/** Call from a mic / Live click so the first reply is not blocked by autoplay. */
export async function unlockAudio(): Promise<void> {
  const ctx = ensureCtx()
  try {
    if (ctx?.state === 'suspended') await ctx.resume()
    if (ctx) {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
    }
  } catch {
    /* ignore */
  }
  try {
    const click = speaker()
    click.src = SILENT_WAV
    click.volume = 0.05
    await click.play()
    click.pause()
    click.volume = 1
  } catch {
    /* ignore */
  }
  try {
    if (window.speechSynthesis) {
      warmVoices()
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    }
  } catch {
    /* ignore */
  }
}

export function resumeAudio(): void {
  const ctx = ensureCtx()
  if (ctx?.state === 'suspended') void ctx.resume()
  try {
    if (window.speechSynthesis?.paused) window.speechSynthesis.resume()
  } catch {
    /* ignore */
  }
}

function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length ? parts : [text]
}

function speakBrowser(text: string, hooks: SpeakHooks, gen: number, useVoice = true): Promise<boolean> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve(false)
      return
    }
    warmVoices()
    try {
      window.speechSynthesis.resume()
    } catch {
      /* ignore */
    }
    const chunks = splitSentences(text)
    let i = 0
    let started = false
    let finished = false
    const pump = window.setInterval(() => {
      if (gen !== speakGen) {
        window.clearInterval(pump)
        return
      }
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume()
      } catch {
        /* ignore */
      }
    }, 2500)
    const finish = (ok: boolean) => {
      if (finished) return
      finished = true
      window.clearInterval(pump)
      window.clearTimeout(hard)
      if (heldUtterance) heldUtterance = null
      resolve(ok)
    }
    const queue = (preferVoice: boolean) => {
      if (gen !== speakGen) {
        finish(started)
        return
      }
      if (i >= chunks.length) {
        hooks.onEnd?.()
        finish(true)
        return
      }
      const u = new SpeechSynthesisUtterance(chunks[i])
      heldUtterance = u
      u.rate = 0.98
      u.pitch = 0.98
      u.volume = 1
      u.lang = 'en-GB'
      if (preferVoice) {
        const voice = pickVoice()
        if (voice) {
          u.voice = voice
          u.lang = /^en/i.test(voice.lang) ? voice.lang : 'en-GB'
        }
      }
      u.onboundary = () => {
        if (gen === speakGen) hooks.onBoundary?.()
      }
      u.onstart = () => {
        if (gen !== speakGen) return
        if (!started) {
          started = true
          hooks.onStart?.()
        }
      }
      u.onend = () => {
        i += 1
        queue(preferVoice)
      }
      u.onerror = (ev) => {
        const err = (ev as { error?: string }).error
        if (gen !== speakGen) {
          finish(started)
          return
        }
        if (err === 'interrupted' || err === 'canceled') {
          if (!started) return
          finish(true)
          return
        }
        i += 1
        queue(preferVoice)
      }
      window.speechSynthesis.speak(u)
      window.setTimeout(() => {
        if (gen !== speakGen || finished || started) return
        if (preferVoice) {
          u.onend = null
          u.onerror = null
          try {
            window.speechSynthesis.cancel()
          } catch {
            /* ignore */
          }
          window.setTimeout(() => {
            if (gen !== speakGen || finished || started) return
            queue(false)
          }, 80)
          return
        }
        finish(false)
      }, 900)
    }
    const hard = window.setTimeout(() => finish(started), 24_000)
    window.setTimeout(() => queue(useVoice), 80)
  })
}

function dumpAudio(audio: HTMLAudioElement, url: string) {
  try {
    audio.onended = null
    audio.onerror = null
    audio.onplaying = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  } catch {
    /* ignore */
  }
  URL.revokeObjectURL(url)
  if (neuralAudio === audio) neuralAudio = null
}

async function speakNeural(text: string, hooks: SpeakHooks, gen: number): Promise<boolean> {
  if (Date.now() < neuralSkipUntil) return false
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 8_000)
  try {
    const res = await fetch('/__aria/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 900) }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      if (res.status === 429 || res.status === 503 || res.status === 401) neuralSkipUntil = Date.now() + 90_000
      return false
    }
    const type = (res.headers.get('content-type') || '').toLowerCase()
    if (type.includes('json') || type.includes('text/')) return false
    const buf = await res.arrayBuffer()
    if (gen !== speakGen) return true
    if (buf.byteLength < 80) return false
    const mime = type.includes('audio') || type.includes('octet') ? type : 'audio/mpeg'
    const url = URL.createObjectURL(new Blob([buf], { type: mime }))
    const audio = speaker()
    audio.src = url
    neuralAudio = audio
    hooks.onStart?.()
    await audio.play()
    if (gen !== speakGen) {
      dumpAudio(audio, url)
      return true
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        dumpAudio(audio, url)
        resolve()
      }
      audio.onended = done
      audio.onerror = done
    })
    if (gen === speakGen) hooks.onEnd?.()
    return true
  } catch {
    neuralSkipUntil = Date.now() + 45_000
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

export async function speak(text: string, hooks: SpeakHooks = {}): Promise<SpeakResult> {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) {
    hooks.onEnd?.()
    return { ok: true, engine: null }
  }
  resumeAudio()
  silence()
  const gen = speakGen
  await delay(80)
  if (gen !== speakGen) return { ok: true, engine: null }
  const neural = await speakNeural(clean, hooks, gen)
  if (gen !== speakGen) return { ok: true, engine: neural ? 'neural' : null }
  if (neural) return { ok: true, engine: 'neural' }
  await delay(80)
  if (gen !== speakGen) return { ok: true, engine: null }
  const browser = await speakBrowser(clean, hooks, gen)
  if (gen !== speakGen) return { ok: true, engine: browser ? 'browser' : null }
  if (browser) return { ok: true, engine: 'browser' }
  hooks.onEnd?.()
  return {
    ok: false,
    engine: null,
    error: 'I could not speak. Unmute this tab, tap Hear Aria, then try again.',
  }
}

export function spokenFrom(text: string, bullets?: string[], actionLabels?: string[]): string {
  const acts = actionLabels?.length ? ` I can ${actionLabels.join(', or ')}. Say yes when you want me to do it.` : ''
  return `${forVoice(text, bullets)}${acts}`.replace(/\s+/g, ' ').trim()
}
