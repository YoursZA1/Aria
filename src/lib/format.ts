const ZAR = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

export function money(n: number): string {
  return ZAR.format(n).replace('ZAR', 'R')
}

export function moneyCompact(n: number): string {
  return `R${n.toLocaleString('en-ZA')}`
}

export function fmtDate(iso: string): string {
  const d = parseISO(iso)
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateShort(iso: string): string {
  const d = parseISO(iso)
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}

export function greetingFor(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export { wakePattern as hearName, stripWake as stripAddress } from './hear'

export function todayISO(): string {
  return toISO(new Date())
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = parseISO(fromIso).getTime()
  const b = parseISO(toIso).getTime()
  return Math.round((b - a) / 86400000)
}

export function nextFriday(from = new Date()): string {
  const d = new Date(from)
  const day = d.getDay()
  const add = day === 5 ? 7 : (5 - day + 7) % 7 || 7
  d.setDate(d.getDate() + add)
  return toISO(d)
}

export function nextMonday(from = new Date()): string {
  const d = new Date(from)
  const day = d.getDay()
  const add = day === 1 ? 7 : (1 - day + 7) % 7 || 7
  d.setDate(d.getDate() + add)
  return toISO(d)
}

export function weekdayName(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short' })
}
