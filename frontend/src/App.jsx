import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Layout, MessageSquare, Database, Settings, Moon, Sun, 
  History, Plus, MessageCircle, MoreVertical, Trash2
} from 'lucide-react'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import { useTheme } from './context/ThemeContext'
import { getSessions } from './utils/api'

const App = () => {
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  const USER_ID = 'ankit_user'

  const refreshSessions = async () => {
    setLoadingSessions(true)
    try {
      const data = await getSessions(USER_ID)
      setSessions(data)
    } catch (err) {
      console.error("Failed to fetch sessions", err)
    }
    setLoadingSessions(false)
  }

  useEffect(() => {
    refreshSessions()
    window.addEventListener('refresh-sessions', refreshSessions)
    return () => window.removeEventListener('refresh-sessions', refreshSessions)
  }, [])

  const navItems = [
    { path: '/', icon: <MessageSquare size={18} />, label: 'New Chat' },
    { path: '/dashboard', icon: <Database size={18} />, label: 'Analytics' },
  ]

  const handleNewChat = () => {
    window.dispatchEvent(new CustomEvent('new-chat'))
    navigate('/')
  }

  const handleLoadSession = (sessionId) => {
    window.dispatchEvent(new CustomEvent('load-session', { detail: { sessionId } }))
    navigate('/')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)] transition-colors duration-300">
      
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="w-72 border-r border-[var(--border)] flex flex-col glass z-30 overflow-hidden">
        
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Layout size={20} className="text-white" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">
              AXIOM <span className="text-emerald-500">AI</span>
            </span>
          </div>
        </div>

        <div className="px-4 mb-4">
          <button 
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-all font-medium shadow-lg shadow-emerald-500/10"
          >
            <Plus size={18} />
            <span>New Conversation</span>
          </button>
        </div>

        <nav className="px-4 mb-6 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 text-sm
                ${isActive 
                  ? 'bg-emerald-500/10 text-emerald-500 font-semibold' 
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
                }
              `}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* ── Chat History ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 border-t border-[var(--border)] pt-6">
          <div className="px-6 mb-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            <span>Recent History</span>
            <History size={12} />
          </div>
          
          <div className="flex-1 overflow-y-auto px-4 space-y-1 scrollbar-hide">
            {sessions.length === 0 && !loadingSessions && (
              <div className="px-4 py-10 text-center">
                <p className="text-xs text-[var(--text-secondary)] italic">No conversations yet</p>
              </div>
            )}
            
            {sessions.map((s) => (
              <button
                key={s.session_id}
                onClick={() => handleLoadSession(s.session_id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-[var(--surface-hover)] transition-all group relative overflow-hidden"
              >
                <MessageCircle size={16} className="text-emerald-500/50 group-hover:text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate pr-4 text-[var(--text)]">{s.title || 'Untitled Chat'}</p>
                  <p className="text-[10px] text-[var(--text-secondary)] opacity-60">
                    {new Date(s.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <MoreVertical size={14} className="text-[var(--text-secondary)]" />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 bg-[var(--surface)] border-t border-[var(--border)] space-y-2">
          <button 
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] transition-all text-sm"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span className="font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          
          <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] pt-4 mt-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-white shadow-lg">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">Ankit</p>
              <p className="text-[10px] text-[var(--text-secondary)]">Pro Account</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <main className="flex-1 relative flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -5 }}
            transition={{ duration: 0.15 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <Routes>
              <Route path="/" element={<ChatPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
