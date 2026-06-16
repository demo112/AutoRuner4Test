import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ComponentRegistry from './pages/ComponentRegistry'
import TaskManager from './pages/TaskManager'
import TaskDetail from './pages/TaskDetail'
import Dashboard from './pages/Dashboard'
import KnowledgeBase from './pages/KnowledgeBase'
import PipelineTemplates from './pages/PipelineTemplates'
import PipelineRuns from './pages/PipelineRuns'

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
          <Route path="/pipeline-templates" element={<PipelineTemplates />} />
          <Route path="/pipeline-runs" element={<PipelineRuns />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
