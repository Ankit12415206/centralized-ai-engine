import React, { useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import { useTheme } from './context/ThemeContext'
import { Brain, MessageSquare, BarChart2, Sun, Moon, Zap, LayoutGrid, Cpu } from 'lucide-react'

export default function App() {
  const { theme, toggle, isDark } = useTheme()
  const location = useLocation()
  const [hoveredNav, setHoveredNav] = useState(null)

  const navItems = [
    { to: '/', icon: MessageSquare, label: 'Chat Engine' },
    { to: '/dashboard', icon: LayoutGrid, label: 'Analytics' },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-[#050505] selection:bg-emerald-500/30 selection:text-emerald-200">

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="glass-panel w-20 flex flex-col items-center py-8 shrink-0 z-30 border-r border-white/5">
        
        {/* Premium Logo */}
        <div className="relative mb-10 group">
          <div className="absolute -inset-2 bg-emerald-500/20 rounded-2xl blur-xl group-hover:bg-emerald-500/40 transition-all duration-500 opacity-0 group-hover:opacity-100" />
          <motion.div 
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.6, ease: "anticipate" }}
            className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] border border-emerald-400/50"
          >
            <Cpu size={24} />
          </motion.div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-4">
          {navItems.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to
            return (
              <div key={to} className="relative">
                <NavLink
                  to={to}
                  onMouseEnter={() => setHoveredNav(to)}
                  onMouseLeave={() => setHoveredNav(null)}
                  className={`
                    w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 relative
                    ${isActive ? 'bg-white/10 text-emerald-400 border border-emerald-500/30' : 'text-white/30 hover:bg-white/5 hover:text-white/60'}
                  `}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="nav-active"
                      className="absolute -left-4 w-1 h-6 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)]"
                    />
                  )}
                  <Icon size={20} />
                </NavLink>

                {/* Tooltip */}
                <AnimatePresence>
                  {hoveredNav === to && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#121212] border border-white/10 text-[11px] font-medium text-white/80 whitespace-nowrap pointer-events-none shadow-2xl z-50"
                    >
                      {label}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center gap-6">
          <button
            onClick={toggle}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-all duration-300 group"
          >
            <div className={`transition-all duration-500 ${isDark ? 'text-amber-400 group-hover:rotate-90' : 'text-emerald-500'}`}>
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </div>
          </button>
          
          <div className="text-[10px] font-mono text-white/20 tracking-tighter uppercase vertical-text transform -rotate-180 mb-2" style={{ writingMode: 'vertical-rl' }}>
            Persistent AI
          </div>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 relative flex flex-col bg-[#050505]">
        {/* Ambient Glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/3 blur-[100px] rounded-full translate-y-1/3 -translate-x-1/4 pointer-events-none" />
        
        <div className="relative flex-1 flex flex-col h-full overflow-hidden">
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
