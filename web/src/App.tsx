import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ComponentRegistry from './pages/ComponentRegistry'
import TaskManager from './pages/TaskManager'
import TaskDetail from './pages/TaskDetail'
import Dashboard from './pages/Dashboard'
import KnowledgeBase from './pages/KnowledgeBase'
import WorkspaceTemplates from './pages/WorkspaceTemplates'
import WorkspaceSessions from './pages/WorkspaceSessions'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/components" element={<ComponentRegistry />} />
          <Route path="/tasks" element={<TaskManager />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/knowledge" element={<KnowledgeBase />} />
          <Route path="/workspace-templates" element={<WorkspaceTemplates />} />
          <Route path="/workspace-sessions" element={<WorkspaceSessions />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
