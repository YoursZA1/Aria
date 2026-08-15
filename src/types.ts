export type AgentId =
  | 'ceo'
  | 'client'
  | 'project'
  | 'finance'
  | 'marketing'
  | 'creative'

export type TaskStatus = 'backlog' | 'progress' | 'review' | 'done'
export type Priority = 'low' | 'med' | 'high'
export type InvoiceStatus = 'draft' | 'sent' | 'overdue' | 'paid'
export type ClientHealth = 'healthy' | 'watch' | 'risk'
export type LeadStage = 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
export type ProjectStatus = 'brief' | 'production' | 'review' | 'live' | 'paused'
export type EmailStatus = 'draft' | 'pending' | 'sent' | 'skipped'
export type ActionStatus = 'proposed' | 'pending_approval' | 'done' | 'dismissed'

export type Company = {
  id: string
  name: string
  tagline: string
  owner: string
  ownerShort: string
  currency: 'ZAR'
  timezone: string
  monthTarget: number
  revenueMtd: number
  assistantName: string
  paidlyUrl: string
  brandCafeUrl: string
}

export type Person = {
  id: string
  name: string
  role: string
  load: number
  capacity: number
  focus: string
}

export type Client = {
  id: string
  name: string
  contact: string
  email: string
  industry: string
  status: 'active' | 'onboarding' | 'paused'
  health: ClientHealth
  awaitingFeedback: boolean
  lastContact: string
  notes: string
  retainer: number
}

export type Project = {
  id: string
  clientId: string
  name: string
  status: ProjectStatus
  due: string
  daysBehind: number
  ownerId: string
  brief: string
  deliverables: string[]
  bottleneck?: string
}

export type Task = {
  id: string
  title: string
  due: string
  priority: Priority
  status: TaskStatus
  projectId?: string
  clientId?: string
  assigneeId: string
  today: boolean
}

export type Invoice = {
  id: string
  clientId: string
  number: string
  amount: number
  issued: string
  due: string
  status: InvoiceStatus
  remindedAt?: string
}

export type Lead = {
  id: string
  company: string
  contact: string
  email: string
  value: number
  stage: LeadStage
  source: string
  nextStep: string
}

export type CalEvent = {
  id: string
  title: string
  date: string
  time: string
  projectId?: string
  clientId?: string
  kind: 'internal' | 'client' | 'review' | 'shoot'
}

export type Campaign = {
  id: string
  name: string
  clientId?: string
  channel: string
  status: 'draft' | 'live' | 'paused'
  spend: number
  performance: string
}

export type Brand = {
  id: string
  clientId: string
  voice: string
  colors: string[]
  typefaces: string[]
  direction: string
}

export type Email = {
  id: string
  to: string
  toName: string
  subject: string
  body: string
  purpose: 'invoice_reminder' | 'follow_up' | 'reschedule' | 'proposal' | 'status'
  status: EmailStatus
  relatedId?: string
  sentAt?: string
}

export type Document = {
  id: string
  title: string
  kind: 'brief' | 'proposal' | 'brand' | 'deck' | 'contract'
  clientId?: string
  projectId?: string
  updated: string
}

export type ProposedAction = {
  id: string
  kind:
    | 'draft_reminders'
    | 'send_emails'
    | 'reschedule'
    | 'follow_up'
    | 'create_task'
    | 'view_project'
    | 'draft_proposal'
    | 'reassign'
    | 'cursor_build'
  label: string
  secondaryLabel?: string
  description: string
  payload: Record<string, unknown>
  status: ActionStatus
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  agentId?: AgentId
  text: string
  bullets?: string[]
  actions?: ProposedAction[]
  intent?: string
  createdAt: string
}

export type Activity = {
  id: string
  text: string
  at: string
}

export type AgentDef = {
  id: AgentId
  name: string
  title: string
  blurb: string
  greeting: string
}

export type BuildNote = {
  id: string
  text: string
  at: string
  shipped?: boolean
}

export type CursorProduct = 'aria' | 'paidly' | 'brandcafe'
export type CursorSource = 'chat' | 'autopilot' | 'kernel'
export type CursorRunStatus = 'idle' | 'queued' | 'running' | 'finished' | 'error' | 'cancelled'

export type CursorRun = {
  id: string
  agentId?: string
  runId?: string
  status: CursorRunStatus
  product: CursorProduct
  title: string
  promptPreview: string
  cwd?: string
  source: CursorSource
  startedAt?: string
  finishedAt?: string
  summary?: string
  liveText?: string
  error?: string
  roadmapId?: string
}

export type CursorJob = {
  product: CursorProduct
  title: string
  prompt: string
  source: CursorSource
  roadmapId?: string
}

export type Skill = {
  id: string
  name: string
  keywords: string[]
  reply: string
  agentId: AgentId
  source: 'self' | 'mando' | 'web' | 'cursor'
  origin?: 'user' | 'project' | 'claude'
  description?: string
  uses: number
  createdAt: string
}

export type Finding = {
  id: string
  loop: 'analyze' | 'repair' | 'build'
  severity: 'info' | 'warn' | 'critical'
  title: string
  detail: string
  status: 'open' | 'fixed' | 'learned'
}

export type Notice = {
  id: string
  text: string
  priority: 1 | 2 | 3 | 4 | 5 | 6
  href?: string
  prompt?: string
}

export type OpportunityVerdict = 'pursue' | 'test' | 'wait' | 'reject'

export type Opportunity = {
  id: string
  title: string
  whyNow: string
  who: string
  whyUs: string
  money: string
  difficulty: 'low' | 'med' | 'high'
  test: string
  verdict: OpportunityVerdict
  reason: string
}

export type Knowledge = {
  id: string
  query: string
  url: string
  title: string
  excerpt: string
  takeaway: string
  at: string
  source: 'search' | 'page'
}

export type DecisionRecord = {
  id: string
  decision: string
  date: string
  context: string
  options: string
  recommendation: string
  decisionMade: string
  expectedOutcome: string
  actualOutcome: string
  lessonsLearned: string
}

export type BusinessState = {
  company: Company
  people: Person[]
  clients: Client[]
  projects: Project[]
  tasks: Task[]
  invoices: Invoice[]
  leads: Lead[]
  events: CalEvent[]
  campaigns: Campaign[]
  brands: Brand[]
  emails: Email[]
  documents: Document[]
  messages: ChatMessage[]
  activity: Activity[]
  roadmap: BuildNote[]
  skills: Skill[]
  findings: Finding[]
  misses: string[]
  repairedIds: string[]
  lastScan?: string
  integrity: number
  notices: Notice[]
  opportunities: Opportunity[]
  knowledge: Knowledge[]
  lastBrowse?: string
  lastLiveSync?: string
  selectedAgent: AgentId | 'auto'
  lastIntent?: string
  briefingDismissed: boolean
  theme: 'dark' | 'light'
  autopilot: boolean
  cursorRun?: CursorRun
  cursorHistory: CursorRun[]
  cursorReady?: boolean
  lastAutopilotAt?: string
  decisions: DecisionRecord[]
}
