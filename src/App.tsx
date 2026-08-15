import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BusinessProvider } from './store/BusinessProvider'
import { VoiceProvider } from './store/VoiceProvider'
import { AppShell } from './components/layout/AppShell'
import { Dashboard } from './pages/Dashboard'
import { Clients } from './pages/Clients'
import { Projects } from './pages/Projects'
import { Work } from './pages/Work'
import { Finance } from './pages/Finance'
import { Marketing } from './pages/Marketing'
import { Creative } from './pages/Creative'
import { Systems } from './pages/Systems'
import { AriaKernel } from './pages/Aria'

function Shell() {
  const [aiOpen, setAiOpen] = useState(false)
  return <AppShell aiOpen={aiOpen} setAiOpen={setAiOpen} />
}

export default function App() {
  return (
    <BusinessProvider>
      <VoiceProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="clients" element={<Clients />} />
            <Route path="projects" element={<Projects />} />
            <Route path="work" element={<Work />} />
            <Route path="finance" element={<Finance />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="creative" element={<Creative />} />
            <Route path="systems" element={<Systems />} />
            <Route path="aria" element={<AriaKernel />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </VoiceProvider>
    </BusinessProvider>
  )
}
