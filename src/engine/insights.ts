import type { BusinessState, Client, Invoice, Person, Project, Task } from '../types'
import { money, todayISO } from '../lib/format'
import { goalProgress } from './goal'

export type Insight = {
  key: string
  area: string
  value: string
  hint: string
  tone: 'neutral' | 'good' | 'warn' | 'risk'
  href: string
}

export function overdueInvoices(state: BusinessState): Invoice[] {
  return state.invoices.filter((i) => i.status === 'overdue')
}

export function overdueTotal(state: BusinessState): number {
  return overdueInvoices(state).reduce((s, i) => s + i.amount, 0)
}

export function outstandingTotal(state: BusinessState): number {
  return state.invoices
    .filter((i) => i.status === 'overdue' || i.status === 'sent')
    .reduce((s, i) => s + i.amount, 0)
}

export function monthRevenue(state: BusinessState): number {
  return state.company.revenueMtd
}

export function tasksDueToday(state: BusinessState, today = todayISO()): Task[] {
  return state.tasks.filter((t) => t.due === today && t.status !== 'done')
}

export function awaitingClients(state: BusinessState): Client[] {
  return state.clients.filter((c) => c.awaitingFeedback)
}

export function productionProjects(state: BusinessState): Project[] {
  return state.projects.filter((p) => p.status === 'production')
}

export function overloadedPeople(state: BusinessState): Person[] {
  return state.people.filter((p) => p.load > p.capacity)
}

export function atRiskProject(state: BusinessState): Project | undefined {
  return [...state.projects].sort((a, b) => b.daysBehind - a.daysBehind).find((p) => p.daysBehind > 0)
}

export function clientById(state: BusinessState, id: string): Client | undefined {
  return state.clients.find((c) => c.id === id)
}

export function personById(state: BusinessState, id: string): Person | undefined {
  return state.people.find((p) => p.id === id)
}

export function silentClients(state: BusinessState, today = todayISO()): Client[] {
  return state.clients.filter((c) => {
    const days = Math.round((new Date(today).getTime() - new Date(c.lastContact).getTime()) / 86400000)
    return days >= 4 && c.status !== 'paused'
  })
}

export function dashboardInsights(state: BusinessState): Insight[] {
  const today = tasksDueToday(state)
  const waiting = awaitingClients(state)
  const prod = productionProjects(state)
  const rev = monthRevenue(state)
  const leads = state.leads.filter((l) => !['won', 'lost'].includes(l.stage))
  const outstanding = outstandingTotal(state)
  const overdue = overdueTotal(state)
  const overloaded = overloadedPeople(state)
  const risk = atRiskProject(state)
  const riskClient = risk ? clientById(state, risk.clientId) : undefined
  const goal = goalProgress(state)

  return [
    {
      key: 'goal',
      area: 'R0 → R1m',
      value: money(goal.collected),
      hint: goal.empty ? 'Empty ledger — 0% of R1 million collected' : `${goal.pct}% collected · next ${money(goal.next)}`,
      tone: goal.collected >= goal.amount ? 'good' : goal.empty ? 'warn' : 'neutral',
      href: '/finance',
    },
    { key: 'tasks', area: 'Tasks', value: `${today.length} due today`, hint: `${state.tasks.filter((t) => t.status === 'review').length} waiting on review`, tone: today.length > 5 ? 'warn' : 'neutral', href: '/work' },
    { key: 'clients', area: 'Clients', value: `${waiting.length} awaiting feedback`, hint: waiting.map((c) => c.name).join(' · ') || 'None blocked', tone: waiting.length ? 'warn' : 'good', href: '/clients' },
    { key: 'projects', area: 'Projects', value: `${prod.length} in production`, hint: `${state.projects.filter((p) => p.daysBehind > 0).length} behind schedule`, tone: risk ? 'risk' : 'neutral', href: '/projects' },
    { key: 'revenue', area: 'Revenue', value: money(rev), hint: state.company.monthTarget ? `${Math.round((rev / state.company.monthTarget) * 100)}% of ${money(state.company.monthTarget)} target` : 'No target set — ledger empty', tone: !state.company.monthTarget ? 'neutral' : rev / state.company.monthTarget >= 0.65 ? 'good' : 'warn', href: '/finance' },
    { key: 'leads', area: 'Leads', value: `${leads.length} active opportunities`, hint: money(leads.reduce((s, l) => s + l.value, 0)) + ' pipeline', tone: 'neutral', href: '/marketing' },
    { key: 'invoices', area: 'Invoices', value: money(overdue) + ' overdue', hint: money(outstanding) + ' outstanding in total', tone: overdue > 0 ? 'risk' : 'good', href: '/finance' },
    { key: 'team', area: 'Team', value: overloaded.length ? `${overloaded.length} people overloaded` : 'Capacity healthy', hint: overloaded.map((p) => `${p.name.split(' ')[0]} ${p.load}%`).join(' · ') || 'All under 100%', tone: overloaded.length ? 'warn' : 'good', href: '/work' },
    {
      key: 'ai',
      area: 'AI Insights',
      value: riskClient ? `${riskClient.name} may miss their deadline.` : 'No critical delivery risks.',
      hint: risk ? `${risk.daysBehind} day${risk.daysBehind === 1 ? '' : 's'} behind · ${risk.name}` : 'Production is on track',
      tone: risk ? 'risk' : 'good',
      href: '/projects',
    },
  ]
}

export function studioScore(state: BusinessState): number {
  let score = 100
  score -= overdueInvoices(state).length * 3
  score -= overloadedPeople(state).length * 3
  score -= (atRiskProject(state)?.daysBehind ?? 0) * 3
  score -= awaitingClients(state).length * 2
  return Math.max(42, Math.min(99, score))
}

export const REVENUE_TREND = [0, 0, 0, 0, 0, 0, 0]

export function briefingPriorities(state: BusinessState): { title: string; detail: string; href: string }[] {
  return tasksDueToday(state).slice(0, 4).map((t) => ({
    title: t.title,
    detail: `${t.priority} · ${t.status}`,
    href: '/work',
    taskId: t.id,
  }))
}
