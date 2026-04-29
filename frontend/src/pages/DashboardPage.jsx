import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getUserContext, clearUserContext } from '../utils/api'
import { useTheme } from '../context/ThemeContext'
import { Database, Trash2, RefreshCw, Clock, MessageSquare, User, Bot, Zap, Activity, Search, ShieldCheck } from 'lucide-react'

export default function DashboardPage() {
  const { isDark } = useTheme()
  const [userId, setUserId] = useState('')
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cleared, setCleared] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)

  const fetchContext = async () => {
    if (!userId.trim()) return
    setLoading(true); setError(''); setCleared(false)
    try { setContext(await getUserContext(userId.trim())) }
    catch { setError('System disconnected. Please verify engine endpoint.'); setContext(null) }
    finally { setLoading(false) }
  }

  const handleClear = async () => {
    if (!userId.trim()) return
    try { await clearUserContext(userId.trim()); setContext([]); setCleared(true) }
    catch { setError('System failure during context purge.') }
  }

  const stats = context ? [
    { label: 'Intelligence Turns', value: context.length, icon: MessageSquare, color: 'text-emerald-400' },
    { label: 'Active Sessions', value: [...new Set(context.map(c => c.session_id))].length, icon: Activity, color: 'text-emerald-400' },
    { label: 'Last Sync', value: context.length ? new Date(context[context.length - 1].timestamp).toLocaleDateString() : 'None', icon: Clock, color: 'text-white/40' },
  ] : []

  return (
    <div className="h-full overflow-y-auto px-6 py-12 bg-[#050505]">
      <div className="max-w-4xl mx-auto">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
              <ShieldCheck size={20} />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Intelligence Dashboard</h1>
          </div>
          <p className="text-white/40 text-sm ml-13 max-w-lg">
            Monitor and audit persistent memory logs across the centralized engine architecture.
          </p>
        </motion.div>

        {/* ── Lookup Area ────────────────────────────────────────────────────── */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel p-6 rounded-[24px] border border-white/5 mb-8"
        >
          <label className="block text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-4">Core Identity Access</label>
          <div className="flex gap-3">
            <div className={`
              flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300
              ${inputFocused ? 'bg-white/5 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.05)]' : 'bg-white/[0.02] border-white/10'}
            `}>
              <Search size={16} className={inputFocused ? 'text-emerald-400' : 'text-white/20'} />
              <input
                value={userId}
                onChange={e => setUserId(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={e => e.key === 'Enter' && fetchContext()}
                placeholder="Enter Persistent User ID..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-white/90 placeholder:text-white/20"
              />
            </div>
            
            <button
              onClick={fetchContext}
              disabled={loading || !userId.trim()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Processing' : 'Access Data'}
            </button>

            <button
              onClick={handleClear}
              disabled={!userId.trim()}
              className="px-4 py-3 rounded-xl border border-white/5 text-white/40 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all disabled:opacity-30"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 text-red-400 text-xs flex items-center gap-2">
                <Zap size={12} /> {error}
              </motion.div>
            )}
            {cleared && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 text-emerald-400 text-xs flex items-center gap-2">
                <Check size={12} /> Persistence layer cleared successfully.
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Results ────────────────────────────────────────────────────────── */}
        {context !== null && (
          <div className="space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats.map((s, i) => (
                <motion.div 
                  key={s.label}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + (i * 0.1) }}
                  className="glass-panel p-5 rounded-2xl border border-white/5"
                >
                  <div className="flex items-center gap-2 mb-3 text-white/30">
                    <s.icon size={12} />
                    <span className="text-[10px] uppercase tracking-widest font-semibold">{s.label}</span>
                  </div>
                  <div className={`text-2xl font-bold font-display ${s.color}`}>
                    {s.value}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Logs */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="text-xs uppercase tracking-widest text-white/30 font-semibold">Intelligence Logs</h3>
                <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">{context.length} entries located</span>
              </div>

              {context.length === 0 ? (
                <div className="glass-panel p-20 flex flex-col items-center justify-center rounded-[32px] border border-white/5 opacity-40">
                   <Database size={40} className="mb-4 text-emerald-500/50" />
                   <p className="text-sm font-medium">No intelligence trace found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {context.map((turn, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + (i * 0.05) }}
                      className="glass-panel rounded-2xl border border-white/5 overflow-hidden group"
                    >
                      <div className="bg-white/[0.02] px-4 py-2 border-b border-white/5 flex justify-between items-center">
                        <div className="text-[10px] font-mono text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                          {turn.session_id?.slice(0, 8)}
                        </div>
                        <span className="text-[10px] font-mono text-white/20">
                          {new Date(turn.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="flex gap-3 items-start">
                          <User size={14} className="mt-1 text-white/20" />
                          <p className="text-sm text-white/70 leading-relaxed">{turn.user}</p>
                        </div>
                        <div className="flex gap-3 items-start p-3 bg-white/[0.01] rounded-xl border border-white/5">
                          <Bot size={14} className="mt-1 text-emerald-500/40" />
                          <p className="text-sm text-white/40 leading-relaxed italic line-clamp-3 group-hover:line-clamp-none transition-all duration-500">
                            {turn.assistant}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}
