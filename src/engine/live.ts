import type { Brand, BusinessState, Campaign, Client, Document, Project } from '../types'
import { readPage } from './browser'
import { todayISO } from '../lib/format'

export const LIVE_URLS = {
  paidly: 'https://www.paidly.co.za',
  brandCafe: 'https://www.brand-cafe.co.za',
} as const

export type LivePage = { url: string; title: string; text: string }

const CAFE_CLIENTS = [
  { name: 'Afri-Eye Technologies', industry: 'Enterprise technology', notes: 'Brand system redesign for enterprise positioning. Public case study on brand-cafe.co.za.' },
  { name: 'Echelon Afrika', industry: 'Services', notes: 'Brand strategy, visual identity, and digital presence. Testimonial: Yolanda N. Zwane.' },
  { name: 'Ison', industry: 'Listed on BrandCafé', notes: 'Named on brand-cafe.co.za as a trusted organisation.' },
  { name: 'Maqureen Pads', industry: 'Listed on BrandCafé', notes: 'Named on brand-cafe.co.za as a trusted organisation.' },
  { name: 'Mo&Co Art Studio', industry: 'Creative', notes: 'Named on brand-cafe.co.za as a trusted organisation.' },
  { name: 'Basetsana', industry: 'Listed on BrandCafé', notes: 'Appears in BrandCafé work.' },
  { name: 'DialaMula', industry: 'Listed on BrandCafé', notes: 'Appears in BrandCafé work.' },
]

const PRODUCTS: { name: string; status: Project['status']; brief: string; tags: string[] }[] = [
  {
    name: 'Paidly',
    status: 'live',
    brief: 'Modern invoicing and business management for SA freelancers, agencies, and growing businesses. Live at paidly.co.za.',
    tags: ['Invoicing', 'Business management', 'SaaS'],
  },
  {
    name: 'Event Platform',
    status: 'review',
    brief: 'End-to-end event management — tickets, attendees, post-event analytics. Listed as Beta on brand-cafe.co.za.',
    tags: ['Event management', 'Ticketing', 'Analytics'],
  },
  {
    name: 'Trading Intelligence',
    status: 'brief',
    brief: 'AI-powered market insights. Listed as In Development on brand-cafe.co.za.',
    tags: ['AI', 'Trading', 'Analytics'],
  },
  {
    name: 'Fasting App',
    status: 'brief',
    brief: 'Faith-driven fasting and spiritual growth. Listed as In Development on brand-cafe.co.za.',
    tags: ['Wellness', 'Faith', 'Mobile'],
  },
]

export async function pullLivePages(): Promise<{ paidly: LivePage; cafe: LivePage }> {
  const [paidly, cafe] = await Promise.all([readPage(LIVE_URLS.paidly), readPage(LIVE_URLS.brandCafe)])
  return { paidly, cafe }
}

export function hydrateFromLive(state: BusinessState, pages: { paidly: LivePage; cafe: LivePage }): BusinessState {
  const cafeText = pages.cafe.text
  const paidlyText = pages.paidly.text
  const today = todayISO()
  const keep = <T extends { id: string }>(rows: T[]) => rows.filter((r) => !r.id.startsWith('live-'))

  const tagline = firstMatch(cafeText, /Build brands, systems, and digital infrastructure that scale\.?/i)
    || state.company.tagline
  const phone = firstMatch(cafeText, /\+27\s*\d{2}\s*\d{3}\s*\d{4}/)
  const paidlySupport = firstMatch(paidlyText, /[\w.+-]+@paidly\.co\.za/i) || 'support@paidly.co.za'
  const pricing = parsePaidlyPricing(paidlyText)

  const self: Client = {
    id: 'live-self',
    name: 'BrandCafé',
    contact: 'Mando',
    email: paidlySupport,
    industry: 'Creative consulting + products',
    status: 'active',
    health: 'healthy',
    awaitingFeedback: false,
    lastContact: today,
    notes: `Operating company. ${tagline}${phone ? ` · ${phone}` : ''}. Source: ${LIVE_URLS.brandCafe}`,
    retainer: 0,
  }

  const clients: Client[] = [
    self,
    ...CAFE_CLIENTS.filter((c) => present(cafeText, c.name.split(/[\s-]/)[0])).map((c, i) => ({
      id: `live-cl${i + 1}`,
      name: c.name,
      contact: '',
      email: '',
      industry: c.industry,
      status: 'active' as const,
      health: 'healthy' as const,
      awaitingFeedback: false,
      lastContact: today,
      notes: `${c.notes} Source: ${LIVE_URLS.brandCafe}`,
      retainer: 0,
    })),
  ]

  const projects: Project[] = PRODUCTS.filter((p) => present(cafeText, p.name) || present(paidlyText, p.name)).map((p, i) => ({
    id: `live-pr${i + 1}`,
    clientId: 'live-self',
    name: p.name,
    status: p.status,
    due: today,
    daysBehind: 0,
    ownerId: 'p1',
    brief: p.brief,
    deliverables: p.tags,
  }))

  const campaigns: Campaign[] = [
    {
      id: 'live-c1',
      name: 'Paidly — get started free',
      channel: LIVE_URLS.paidly,
      status: 'live',
      spend: 0,
      performance: `${pricing.label}. No credit card to start. ${paidlySupport}`,
    },
    {
      id: 'live-c2',
      name: 'BrandCafé — book a consultation',
      channel: LIVE_URLS.brandCafe,
      status: 'live',
      spend: 0,
      performance: phone ? `Phone ${phone}.` : 'Consultation CTA live on site.',
    },
    {
      id: 'live-c3',
      name: 'Paidly affiliate programme',
      channel: `${LIVE_URLS.paidly}`,
      status: 'live',
      spend: 0,
      performance: 'Recurring revenue on paid referrals.',
    },
  ]

  const brands: Brand[] = [
    {
      id: 'live-b1',
      clientId: 'live-self',
      voice: 'BrandCafé: systems-led, product-minded, long-term. Not a traditional agency.',
      colors: ['#0B1220', '#00D2FF', '#A855F7', '#F4F7FF'],
      typefaces: ['Outfit', 'Rajdhani'],
      direction: tagline,
    },
    {
      id: 'live-b2',
      clientId: 'live-self',
      voice: 'Paidly: clean, honest, South African. Get paid faster without the admin.',
      colors: ['#0B1220', '#22C55E', '#F4F7FF'],
      typefaces: ['Outfit'],
      direction: firstMatch(paidlyText, /Create invoices, send quotes, and track payments[^.]+/) || 'Invoices, quotes, payments — one platform.',
    },
  ]

  const documents: Document[] = [
    { id: 'live-d1', title: `Paidly pricing — ${pricing.label}`, kind: 'proposal', updated: today },
    { id: 'live-d2', title: 'BrandCafé public offering (live site)', kind: 'brief', updated: today },
  ]

  const activity = [
    {
      id: `log-live-${Date.now()}`,
      text: `Aria synced live sites: BrandCafé (${clients.length} organisations, ${projects.length} products) · Paidly ${pricing.label}`,
      at: new Date().toISOString(),
    },
    ...state.activity.filter((a) => !a.text.startsWith('Aria synced live sites')),
  ]

  return {
    ...state,
    company: {
      ...state.company,
      name: 'BrandCafé',
      tagline,
      paidlyUrl: LIVE_URLS.paidly,
      brandCafeUrl: LIVE_URLS.brandCafe,
      revenueMtd: 0,
      monthTarget: 0,
    },
    people: state.people.some((p) => /mando/i.test(p.name))
      ? state.people.map((p) => (/mando/i.test(p.name) ? { ...p, focus: 'BrandCafé + Paidly' } : p))
      : [{ id: 'p1', name: 'Mando', role: 'Founder / Creative Director', load: 0, capacity: 100, focus: 'BrandCafé + Paidly' }, ...state.people],
    clients: [...keep(state.clients), ...clients],
    projects: [...keep(state.projects), ...projects],
    campaigns: [...keep(state.campaigns), ...campaigns],
    brands: [...keep(state.brands), ...brands],
    documents: [...keep(state.documents), ...documents],
    invoices: state.invoices.filter((i) => !/OTD-|Highveld|Brightleaf|Table Bay/i.test(`${i.number}${i.id}`)),
    leads: state.leads.filter((l) => !/Veld Electric|Cape Line|Orchard Kids|Northwind|Brightline|Nova Fitness/i.test(l.company)),
    lastLiveSync: new Date().toISOString(),
    activity,
  }
}

export function parsePaidlyPricing(text: string) {
  const starter = digits(firstMatch(text, /Starter[\s\S]{0,120}?R\s*(\d+)/i)) || 50
  const business = digits(firstMatch(text, /Business[\s\S]{0,120}?R\s*(\d+)/i)) || 150
  const growth = digits(firstMatch(text, /Growth[\s\S]{0,120}?R\s*(\d+)/i)) || 350
  return { starter, business, growth, label: `Starter R${starter} / Business R${business} / Growth R${growth}` }
}

function present(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase())
}

function firstMatch(text: string, re: RegExp) {
  const m = text.match(re)
  return (m?.[1] || m?.[0] || '').replace(/\s+/g, ' ').trim()
}

function digits(s: string) {
  const n = Number(s.replace(/\D/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}
