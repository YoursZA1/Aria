import type { BusinessState, Email, ProposedAction } from '../types'
import { uid } from '../lib/format'
import { clientById, overdueInvoices } from './insights'

export function reminderDrafts(state: BusinessState): Email[] {
  return overdueInvoices(state).map((inv) => {
    const client = clientById(state, inv.clientId)
    const first = client?.contact.split(' ')[0] ?? 'there'
    return {
      id: uid('em'),
      to: client?.email ?? '',
      toName: client?.contact ?? '',
      subject: `Friendly reminder — invoice ${inv.number}`,
      body: `Hi ${first},\n\nHope you're well. This is a quick note that invoice ${inv.number} for ${formatRand(inv.amount)} was due ${inv.due} and is still open.\n\nIf it's already in the queue, ignore this. If anything on the invoice looks off, reply and I'll sort it today.\n\nThanks,\nMando\nBrandCafé`,
      purpose: 'invoice_reminder',
      status: 'pending',
      relatedId: inv.id,
    }
  })
}

export function followUpDraft(state: BusinessState, clientId: string): Email | null {
  const client = clientById(state, clientId)
  if (!client) return null
  const first = client.contact.split(' ')[0]
  return {
    id: uid('em'),
    to: client.email,
    toName: client.contact,
    subject: `Checking in — ${client.name}`,
    body: `Hi ${first},\n\nWanted to bump this gently — we last spoke on ${client.lastContact} and I don't want the work to stall on our side.\n\n${client.notes}\n\nIf it's easier, I can jump on a 15-minute call tomorrow. What works?\n\nMando`,
    purpose: 'follow_up',
    status: 'pending',
    relatedId: client.id,
  }
}

export function rescheduleDraft(state: BusinessState, clientId: string, newDateLabel: string): Email | null {
  const client = clientById(state, clientId)
  if (!client) return null
  const first = client.contact.split(' ')[0] || client.name
  return {
    id: uid('em'),
    to: client.email,
    toName: client.contact || client.name,
    subject: `Moving our review to ${newDateLabel}`,
    body: `Hi ${first},\n\nI'd like to move our review to ${newDateLabel}. Does that still work on your side?\n\nMando\nBrandCafé`,
    purpose: 'reschedule',
    status: 'pending',
    relatedId: clientId,
  }
}

export function proposalDraft(state: BusinessState): Email | null {
  const lead = state.leads.find((l) => !['won', 'lost'].includes(l.stage))
  if (!lead) return null
  return {
    id: uid('em'),
    to: lead.email,
    toName: lead.contact,
    subject: `BrandCafé — proposal for ${lead.company}`,
    body: `Hi ${lead.contact.split(' ')[0] || lead.contact},\n\nProposal attached for ${lead.company} (${formatRand(lead.value)}).\n\nMando\nBrandCafé\n${state.company.brandCafeUrl}`,
    purpose: 'proposal',
    status: 'pending',
    relatedId: lead.id,
  }
}

export function markAction(actions: ProposedAction[] | undefined, id: string, status: ProposedAction['status']): ProposedAction[] {
  return (actions ?? []).map((a) => (a.id === id ? { ...a, status } : a))
}

function formatRand(n: number): string {
  return `R${n.toLocaleString('en-ZA')}`
}
