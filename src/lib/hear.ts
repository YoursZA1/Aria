/** Turn messy speech-to-text into what Mando actually meant. */

import { isAcknowledgment } from './ack'
import { foldAsk } from './fold'

export type Heard =
  | { kind: 'noise' }
  | { kind: 'stop' }
  | { kind: 'wake' }
  | { kind: 'ask'; text: string }

const FILLER = /^(?:uh+|um+|erm+|hmm+|ah+|oh+|mhm+|mm+|like|so|yeah|yes|ok|okay|right)\s*$/i

const STOP =
  /^(?:stop|quiet|silence|cancel|never mind|nevermind|that's enough|thats enough|shut up|be quiet|stop talking)\s*[.!?]*$/i

const LEXICON: [RegExp, string][] = [
  [/\b(paildy|paidlee|paid lee|paidli|pedley|pale lee|paydly|paidly\.co)\b/gi, 'Paidly'],
  [/\bbrand\s*(cafe|café|coffee|cafes)\b/gi, 'BrandCafé'],
  [/\bbrandcafe\b/gi, 'BrandCafé'],
  [/\b(mondo|mandoh|armando)\b/gi, 'Mando'],
  [/\bon the design\b/gi, 'BrandCafé'],
  [/\b(prioritize|prioritise)\b/gi, 'prioritise'],
  [/\banalyse\b/gi, 'analyse'],
  [/\banalyze\b/gi, 'analyse'],
]

export function wakePattern(name: string) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:${n}|arya|aria|area|ari|auria)`, 'i')
}

export function normalizeTranscript(raw: string, name: string): string {
  let t = foldAsk(raw)
  if (!t) return ''
  const wake = wakePattern(name)
  t = t.replace(new RegExp(`\\barea\\b`, 'gi'), (m, offset) => {
    if (offset < 18 || new RegExp(`(?:hey|hi|hello|ok|okay)\\s+${m}`, 'i').test(t.slice(Math.max(0, offset - 8), offset + m.length))) {
      return name
    }
    return m
  })
  t = t.replace(new RegExp(`\\b(?:arya|aria|ari|auria)\\b`, 'gi'), name)
  t = t.replace(wake, name)
  for (const [from, to] of LEXICON) t = t.replace(from, to)
  t = t.replace(/[.]{2,}/g, '.')
  return t.replace(/\s+/g, ' ').trim()
}

export function stripWake(raw: string, name: string): string {
  const n = wakePattern(name).source
  return raw
    .replace(new RegExp(`^(?:(?:hey|hi|hello|ok|okay|yo|so)\\s+)?(?:${n})\\b[,.:!?\\s]*`, 'i'), '')
    .trim()
}

export function interpretHeard(
  raw: string,
  name: string,
  opts: { live: boolean; openFloor: boolean },
): Heard {
  const normalised = normalizeTranscript(raw, name)
  if (!normalised) return { kind: 'noise' }
  if (isAcknowledgment(normalised)) return { kind: 'ask', text: normalised }
  if (FILLER.test(normalised) || normalised.length < 2) return { kind: 'noise' }
  if (STOP.test(normalised)) return { kind: 'stop' }

  const rest = stripWake(normalised, name)
  const addressed = rest !== normalised
  const wakeOnly = addressed && rest.length === 0

  if (wakeOnly) return { kind: 'wake' }
  if (STOP.test(rest)) return { kind: 'stop' }

  if (opts.live && !opts.openFloor && !addressed) return { kind: 'noise' }

  const text = rest || normalised
  if (!text || (FILLER.test(text) && !isAcknowledgment(text))) return { kind: 'noise' }
  return { kind: 'ask', text }
}

export function forVoice(text: string, bullets?: string[]): string {
  const extra = (bullets ?? []).slice(0, 2).join('. ')
  let spoken = `${text}${extra ? ` ${extra}.` : ''}`
  spoken = spoken
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[`*_#>]/g, '')
    .replace(/\bR\s?(\d+(?:[.,]\d+)?)k\b/gi, '$1 thousand rand')
    .replace(/\bR\s?(\d[\d\s,]*)\b/g, '$1 rand')
    .replace(/\s+/g, ' ')
    .trim()
  if (spoken.length <= 520) return spoken
  const cut = spoken.slice(0, 520)
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  return (at > 180 ? cut.slice(0, at + 1) : cut).trim()
}
