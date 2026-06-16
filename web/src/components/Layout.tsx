import { NavLink, Outlet } from 'react-router-dom'
import { Package, ListTodo, Monitor, BookOpen, GitBranch, Play } from 'lucide-react'

const navItems = [
  { to: '/components', label: '组件市场', icon: Package },
  { to: '/tasks', label: '任务管理', icon: ListTodo },
  { to: '/dashboard', label: '运行监控', icon: Monitor },
  { to: '/knowledge', label: '知识库', icon: BookOpen },
  { to: '/workspace-templates', label: '工作模板', icon: GitBranch },
  { to: '/workspace-sessions', label: '工作会话', icon: Play },
]

export default function Layout() {
  return (
    <div className="flex h-screen">
      <nav className="w-48 border-r bg-gray-50 flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold">AutoRuner4Test</h1>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm ${isActive ? 'bg-gray-200 font-medium' : 'text-gray-600 hover:bg-gray-100'}`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
