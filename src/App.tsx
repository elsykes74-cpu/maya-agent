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
import CallQueue from './pages/CallQueue'
import LeadFinder from './pages/LeadFinder'
import Layout from './components/Layout'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<NotFound />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/lead-finder" element={<LeadFinder />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/calls" element={<CallCenter />} />
        <Route path="/more" element={<More />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/deals" element={<DealAnalysis />} />
        <Route path="/ai-config" element={<AIConfig />} />
        <Route path="/sms" element={<SMSSequences />} />
        <Route path="/dnc" element={<DNCLists />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
