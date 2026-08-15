import { NavLink, Outlet } from 'react-router-dom'
import {
  CalendarCheck,
  Cable,
  FolderKanban,
  LayoutDashboard,
  Megaphone,
  Palette,
  SunMoon,
  Users,
  Wallet,
  Cpu,
  Sparkles,
} from 'lucide-react'
import { useBusiness } from '../../store/BusinessProvider'
import { ChatPanel } from '../ai/ChatPanel'

const LINKS = [
  { to: '/', label: 'Command', icon: LayoutDashboard },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/work', label: 'Work', icon: CalendarCheck },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/creative', label: 'Creative', icon: Palette },
  { to: '/aria', label: 'Aria', icon: Cpu },
  { to: '/systems', label: 'Systems', icon: Cable },
]

export function AppShell({
  aiOpen,
  setAiOpen,
}: {
  aiOpen: boolean
  setAiOpen: (open: boolean) => void
}) {
  const { state, toggleTheme, reset } = useBusiness()
  const collapsed = !aiOpen

  return (
    <div className={`app ${collapsed ? 'ai-collapsed' : ''} ${aiOpen ? 'ai-open' : ''}`} data-theme={state.theme}>
      <aside className="sidebar">
        <div className="brand" title={state.company.assistantName}>
          <div className="brand-mark">A</div>
        </div>
        <nav className="nav">
          {LINKS.map((l) => {
            const Icon = l.icon
            return (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} title={l.label} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon />
                <span>{l.label}</span>
              </NavLink>
            )
          })}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="ghost icon-only" onClick={toggleTheme} title="Toggle theme">
            <SunMoon size={16} />
          </button>
          <button type="button" className="ghost icon-only" onClick={() => setAiOpen(!aiOpen)} title="Conversation log">
            <Sparkles size={16} />
          </button>
          <button type="button" className="ghost icon-only" onClick={reset} title="Reset data">
            {state.company.owner.slice(0, 1)}
          </button>
        </div>
      </aside>
      <main className="main">
        <nav className="mobile-nav">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <Outlet context={{ setAiOpen }} />
      </main>
      {aiOpen && <ChatPanel onCollapse={() => setAiOpen(false)} />}
      <button type="button" className="toggle-ai" onClick={() => setAiOpen(!aiOpen)} aria-label="Open assistant">
        <Sparkles size={18} />
      </button>
    </div>
  )
}
