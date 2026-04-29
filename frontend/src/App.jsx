import React, { useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import { useTheme } from './context/ThemeContext'
import { Brain, MessageSquare, BarChart2, Sun, Moon, Zap } from 'lucide-react'

export default function App() {
  const { theme, toggle, isDark } = useTheme()
  const location = useLocation()
  const [hoveredNav, setHoveredNav] = useState(null)

  const navItems = [
    { to: '/', icon: MessageSquare, label: 'Chat' },
    { to: '/dashboard', icon: BarChart2, label: 'Dashboard' },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside style={{
        width: '64px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '20px',
        paddingBottom: '20px',
        gap: '8px',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        transition: 'background 0.3s, border-color 0.3s',
        zIndex: 10,
        flexShrink: 0,
      }}>

        {/* Logo */}
        <div style={{
          width: '40px', height: '40px',
          borderRadius: '12px',
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '16px',
          color: 'var(--accent)',
          transition: 'all 0.3s',
        }}>
          <Brain size={20} />
        </div>

        {/* Nav Items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {navItems.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to
            return (
              <div key={to} style={{ position: 'relative' }}>
                <NavLink
                  to={to}
                  onMouseEnter={() => setHoveredNav(to)}
                  onMouseLeave={() => setHoveredNav(null)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '44px', height: '44px',
                    borderRadius: '12px',
                    color: isActive ? 'var(--accent)' : hoveredNav === to ? 'var(--text2)' : 'var(--text3)',
                    background: isActive ? 'var(--accent-dim)' : hoveredNav === to ? 'var(--surface2)' : 'transparent',
                    transition: 'all 0.18s ease',
                    textDecoration: 'none',
                    position: 'relative',
                    overflow: 'visible',
                  }}>
                  {/* Active indicator */}
                  {isActive && (
                    <div style={{
                      position: 'absolute',
                      left: '-12px',
                      width: '3px', height: '22px',
                      background: 'var(--accent)',
                      borderRadius: '0 3px 3px 0',
                      animation: 'fadeIn 0.2s ease',
                    }} />
                  )}
                  <Icon size={19} />
                </NavLink>

                {/* Tooltip */}
                {hoveredNav === to && (
                  <div style={{
                    position: 'absolute',
                    left: 'calc(100% + 10px)',
                    top: '50%', transform: 'translateY(-50%)',
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    padding: '5px 10px',
                    borderRadius: '7px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 100,
                    boxShadow: 'var(--shadow)',
                    animation: 'fadeIn 0.15s ease',
                  }}>
                    {label}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Bottom: theme toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>

          {/* Theme toggle button */}
          <button
            onClick={toggle}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: '44px', height: '44px',
              borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isDark ? '#e3b341' : '#0969da',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Version badge */}
          <div style={{
            fontSize: '9px',
            fontFamily: 'DM Mono, monospace',
            color: 'var(--text3)',
            letterSpacing: '0.05em',
          }}>v2.0</div>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </main>
    </div>
  )
}
