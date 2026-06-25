import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import { can } from './lib/permissions'

import Login from './pages/Login'
import NotConfigured from './pages/NotConfigured'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Zones from './pages/Zones'
import TreeRegister from './pages/TreeRegister'
import TreeDetail from './pages/TreeDetail'
import Inventory from './pages/Inventory'
import Requests from './pages/Requests'
import Produce from './pages/Produce'
import Reports from './pages/Reports'
import Users from './pages/Users'

// Wrap a page so only signed-in users (optionally owners) can see it.
function Protected({ children, ownerOnly = false }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (ownerOnly && !can.manageUsers(profile)) return <Navigate to="/" replace />

  return <Layout>{children}</Layout>
}

export default function App() {
  const { isConfigured, loading } = useAuth()

  if (!isConfigured) return <NotConfigured />
  if (loading) return <Spinner />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/tasks" element={<Protected><Tasks /></Protected>} />
      <Route path="/tasks/:id" element={<Protected><TaskDetail /></Protected>} />
      <Route path="/orchard" element={<Protected><Zones /></Protected>} />
      <Route path="/trees" element={<Protected><TreeRegister /></Protected>} />
      <Route path="/trees/:id" element={<Protected><TreeDetail /></Protected>} />
      <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
      <Route path="/requests" element={<Protected><Requests /></Protected>} />
      <Route path="/produce" element={<Protected><Produce /></Protected>} />
      <Route path="/reports" element={<Protected><Reports /></Protected>} />
      <Route path="/users" element={<Protected ownerOnly><Users /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
