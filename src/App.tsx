import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Leads from './pages/Leads'
import CallCenter from './pages/CallCenter'
import Appointments from './pages/Appointments'
import DealAnalysis from './pages/DealAnalysis'
import AIConfig from './pages/AIConfig'
import SMSSequences from './pages/SMSSequences'
import Settings from './pages/Settings'
import Campaigns from './pages/Campaigns'
import DNCLists from './pages/DNCLists'
import More from './pages/More'
import LeadFinder from './pages/LeadFinder'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import PreviewUnavailable from './pages/PreviewUnavailable'
import { isPublicPreview } from './lib/preview'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/lead-finder" element={isPublicPreview ? <PreviewUnavailable feature="Lead Finder" /> : <LeadFinder />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/calls" element={isPublicPreview ? <PreviewUnavailable feature="AI Calling" /> : <CallCenter />} />
          <Route path="/more" element={<More />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/deals" element={<DealAnalysis />} />
          <Route path="/ai-config" element={isPublicPreview ? <PreviewUnavailable feature="AI Configuration" /> : <AIConfig />} />
          <Route path="/sms" element={<SMSSequences />} />
          <Route path="/dnc" element={<DNCLists />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
