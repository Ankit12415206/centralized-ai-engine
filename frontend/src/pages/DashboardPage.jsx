import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  getUserContext, 
  clearUserContext, 
  getPlatforms, 
  getPermissions, 
  setPermission, 
  updatePermission, 
  getPreferences 
} from '../utils/api'
import { useTheme } from '../context/ThemeContext'
import { 
  Database, Trash2, RefreshCw, Clock, MessageSquare, 
  Activity, Search, ShieldCheck, TrendingUp, Zap,
  Lock, Globe, CheckCircle2, XCircle, Share2, Layers, Tag
} from 'lucide-react'

export default function DashboardPage() {
  const { theme } = useTheme()
  const [userId, setUserId] = useState('ankit_user')
  const [selectedPlatform, setSelectedPlatform] = useState('axiom-web')
  const [availablePlatforms, setAvailablePlatforms] = useState(['axiom-web', 'education-platform'])
  
  const [context, setContext] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [preferences, setPreferences] = useState(null)
  
  const [loading, setLoading] = useState(false)
  const [permLoading, setPermLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [inputFocused, setInputFocused] = useState(false)

  // Load platforms and initial data on mount
  useEffect(() => {
    loadAllData('ankit_user', 'axiom-web')
  }, [])

  const loadAllData = async (uid, platform) => {
    if (!uid.trim()) return
    setLoading(true)
    setError('')
    setSuccessMsg('')

    try {
      // 1. Fetch available platforms for user
      const platforms = await getPlatforms(uid.trim(), platform).catch(() => ['axiom-web', 'education-platform'])
      if (platforms && platforms.length > 0) {
        setAvailablePlatforms([...new Set([...platforms, 'axiom-web', 'education-platform'])])
      }

      // 2. Fetch context for selected platform
      const ctxData = await getUserContext(uid.trim(), platform)
      setContext(ctxData || [])

      // 3. Fetch permissions for user
      const permData = await getPermissions(uid.trim(), platform).catch(() => [])
      setPermissions(permData || [])

      // 4. Fetch preferences for user
      const prefData = await getPreferences(uid.trim(), platform).catch(() => null)
      setPreferences(prefData)
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.detail || err.message || 'Failed to load intelligence data.')
    } finally {
      setLoading(false)
    }
  }

  const handlePlatformChange = (newPlatform) => {
    setSelectedPlatform(newPlatform)
    loadAllData(userId, newPlatform)
  }

  const handleTogglePermission = async (perm) => {
    setPermLoading(true)
    setError('')
    try {
      const nextStatus = perm.status === 'granted' ? 'revoked' : 'granted'
      await updatePermission({
        userId: userId.trim(),
        ownerPlatformId: perm.owner_platform_id,
        requesterPlatformId: perm.requester_platform_id,
        status: nextStatus,
        actingPlatformId: selectedPlatform
      })
      setSuccessMsg(`Permission successfully updated to '${nextStatus}'.`)
      // Refresh permissions & context
      const updatedPerms = await getPermissions(userId.trim(), selectedPlatform)
      setPermissions(updatedPerms)
      const updatedCtx = await getUserContext(userId.trim(), selectedPlatform)
      setContext(updatedCtx)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Permission modification failed.')
    } finally {
      setPermLoading(false)
    }
  }

  const handleGrantAccessTo = async (targetPlatform) => {
    setPermLoading(true)
    setError('')
    try {
      await setPermission({
        userId: userId.trim(),
        ownerPlatformId: selectedPlatform,
        requesterPlatformId: targetPlatform,
        status: 'granted',
        actingPlatformId: selectedPlatform
      })
      setSuccessMsg(`Access granted to ${targetPlatform}.`)
      const updatedPerms = await getPermissions(userId.trim(), selectedPlatform)
      setPermissions(updatedPerms)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to grant permission.')
    } finally {
      setPermLoading(false)
    }
  }

  const handleClearMemory = async (scope) => {
    if (!userId.trim()) return
    const scopeLabel = scope === 'platform' ? 'PRIVATE / LOCAL' : scope === 'global' ? 'GLOBAL' : 'ENTIRE'
    if (!window.confirm(`Are you sure you want to purge ${scopeLabel} memories for ${selectedPlatform}? This cannot be undone.`)) {
      return
    }

    setLoading(true)
    setError('')
    try {
      await clearUserContext(userId.trim(), selectedPlatform, scope)
      setSuccessMsg(`${scopeLabel} memory purged successfully for ${selectedPlatform}.`)
      const updatedCtx = await getUserContext(userId.trim(), selectedPlatform)
      setContext(updatedCtx)
      const updatedPrefs = await getPreferences(userId.trim(), selectedPlatform)
      setPreferences(updatedPrefs)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'System failure during context purge.')
    } finally {
      setLoading(false)
    }
  }

  const formatTimestamp = (ts) => {
    try {
      const date = new Date(ts)
      if (isNaN(date.getTime())) return 'Trace Pending'
      return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'Unknown'
    }
  }

  const globalCount = context ? context.filter(c => c.memory_scope === 'global').length : 0
  const privateCount = context ? context.filter(c => c.memory_scope === 'platform').length : 0

  return (
    <div className="h-full overflow-y-auto px-8 py-12 bg-transparent scrollbar-hide">
      <div className="max-w-4xl mx-auto space-y-10">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-end justify-between"
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
                <ShieldCheck size={24} />
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Intelligence Dashboard</h1>
            </div>
            <p className="text-[var(--text-secondary)] text-sm ml-13 opacity-60">
              Audit, govern, and monitor persistent cross-platform memory and authorization.
            </p>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
            <TrendingUp size={12} />
            Live Analytics
          </div>
        </motion.div>

        {/* ── Core Authorization & Platform Filter ───────────────────────────── */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-[24px] p-8 border border-[var(--border)] shadow-2xl"
        >
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] font-bold mb-2 opacity-50">
                  Core User Identity & Platform Scope
                </label>
                <div className="flex items-center gap-2">
                  <div className={`
                    flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300
                    ${inputFocused ? 'bg-[var(--surface-hover)] border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.05)]' : 'bg-[var(--surface)] border-[var(--border)]'}
                  `}>
                    <Search size={16} className={inputFocused ? 'text-emerald-400' : 'text-[var(--text-secondary)] opacity-30'} />
                    <input
                      value={userId}
                      onChange={e => setUserId(e.target.value)}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      onKeyDown={e => e.key === 'Enter' && loadAllData(userId, selectedPlatform)}
                      placeholder="User ID (e.g. ankit_user)..."
                      className="bg-transparent border-none outline-none text-sm font-medium w-48 placeholder:opacity-30"
                    />
                  </div>

                  {/* Platform Selector */}
                  <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-1.5">
                    <Layers size={14} className="text-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Platform:</span>
                    <select
                      value={selectedPlatform}
                      onChange={e => handlePlatformChange(e.target.value)}
                      className="bg-transparent text-xs font-bold text-emerald-400 outline-none cursor-pointer"
                    >
                      {availablePlatforms.map(p => (
                        <option key={p} value={p} className="bg-[var(--surface-solid)] text-[var(--text)]">
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadAllData(userId, selectedPlatform)}
                  disabled={loading || !userId.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-20 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  <span>{loading ? 'Querying' : 'Access Data'}</span>
                </button>

                {/* Scoped Memory Deletion Dropdown / Buttons */}
                <div className="flex items-center gap-1 border border-[var(--border)] rounded-xl p-1 bg-[var(--surface)]">
                  <button
                    onClick={() => handleClearMemory('platform')}
                    disabled={loading || !userId.trim()}
                    className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-tight rounded-lg hover:bg-amber-500/10 hover:text-amber-400 text-[var(--text-secondary)] transition-all"
                    title="Purge only private/local memories on this platform"
                  >
                    Purge Local
                  </button>
                  <button
                    onClick={() => handleClearMemory('global')}
                    disabled={loading || !userId.trim()}
                    className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-tight rounded-lg hover:bg-orange-500/10 hover:text-orange-400 text-[var(--text-secondary)] transition-all"
                    title="Purge only global memories owned by this platform"
                  >
                    Purge Global
                  </button>
                  <button
                    onClick={() => handleClearMemory('all')}
                    disabled={loading || !userId.trim()}
                    className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-tight rounded-lg hover:bg-red-500/10 hover:text-red-400 text-[var(--text-secondary)] transition-all"
                    title="Purge all memories and topics on this platform"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Status Messages */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-red-400 text-xs font-bold tracking-wide flex items-center gap-2 pt-2">
                  <Zap size={14} /> {error}
                </motion.div>
              )}
              {successMsg && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-emerald-400 text-xs font-bold tracking-wide flex items-center gap-2 pt-2">
                  <CheckCircle2 size={14} /> {successMsg}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Stats Row ──────────────────────────────────────────────────────── */}
        {context !== null && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass p-5 rounded-2xl border border-[var(--border)] shadow-md">
              <div className="flex items-center gap-2 mb-2 opacity-50 text-[10px] uppercase font-bold tracking-wider">
                <MessageSquare size={14} className="text-emerald-400" />
                <span>Total Turns</span>
              </div>
              <div className="text-2xl font-display font-bold text-emerald-400">{context.length}</div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }} className="glass p-5 rounded-2xl border border-[var(--border)] shadow-md">
              <div className="flex items-center gap-2 mb-2 opacity-50 text-[10px] uppercase font-bold tracking-wider">
                <Globe size={14} className="text-blue-400" />
                <span>Global Memories</span>
              </div>
              <div className="text-2xl font-display font-bold text-blue-400">{globalCount}</div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="glass p-5 rounded-2xl border border-[var(--border)] shadow-md">
              <div className="flex items-center gap-2 mb-2 opacity-50 text-[10px] uppercase font-bold tracking-wider">
                <Lock size={14} className="text-amber-400" />
                <span>Private Memories</span>
              </div>
              <div className="text-2xl font-display font-bold text-amber-400">{privateCount}</div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }} className="glass p-5 rounded-2xl border border-[var(--border)] shadow-md">
              <div className="flex items-center gap-2 mb-2 opacity-50 text-[10px] uppercase font-bold tracking-wider">
                <Activity size={14} className="text-purple-400" />
                <span>Sessions</span>
              </div>
              <div className="text-2xl font-display font-bold text-purple-400">
                {[...new Set(context.map(c => c.session_id))].length}
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Cross-Platform Sharing & Permissions Governance ───────────────── */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-6 border border-[var(--border)] shadow-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Share2 size={16} className="text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                Cross-Platform Memory Permissions
              </h3>
            </div>
            
            {/* Quick Grant Button */}
            {selectedPlatform === 'axiom-web' && !permissions.some(p => p.owner_platform_id === 'axiom-web' && p.requester_platform_id === 'education-platform') && (
              <button
                onClick={() => handleGrantAccessTo('education-platform')}
                disabled={permLoading}
                className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all"
              >
                + Authorize education-platform
              </button>
            )}
          </div>

          <p className="text-xs text-[var(--text-secondary)] opacity-60 mb-4">
            Controls which platforms are authorized to read this user's global memories. Platform-local memories are strictly isolated and never shared.
          </p>

          {permissions.length === 0 ? (
            <div className="p-6 text-center border border-[var(--border)] border-dashed rounded-xl">
              <p className="text-xs text-[var(--text-secondary)] opacity-40">No cross-platform permissions configured for this platform.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-wider opacity-40">
                    <th className="pb-2">Owner Platform</th>
                    <th className="pb-2">Requester Platform</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Updated</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {permissions.map((p) => {
                    const isOwner = selectedPlatform === p.owner_platform_id
                    const isGranted = p.status === 'granted'
                    return (
                      <tr key={p.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                        <td className="py-3 font-semibold text-[var(--text)]">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border)]">
                            {p.owner_platform_id}
                          </span>
                        </td>
                        <td className="py-3 font-semibold text-[var(--text)]">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border)]">
                            {p.requester_platform_id}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isGranted ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
                          }`}>
                            {isGranted ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 opacity-40 text-[10px] font-mono">
                          {formatTimestamp(p.updated_at)}
                        </td>
                        <td className="py-3 text-right">
                          {isOwner ? (
                            <button
                              onClick={() => handleTogglePermission(p)}
                              disabled={permLoading}
                              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                isGranted 
                                  ? 'border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white' 
                                  : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                              }`}
                            >
                              {isGranted ? 'Revoke Access' : 'Grant Access'}
                            </button>
                          ) : (
                            <span className="text-[10px] opacity-30 italic">Owner managed</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* ── Adaptive Learning Preferences Panel ───────────────────────────── */}
        {preferences && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.25 }}
            className="glass rounded-2xl p-6 border border-[var(--border)] shadow-xl"
          >
            <div className="flex items-center gap-2 mb-3">
              <Tag size={16} className="text-purple-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                Adaptive Learning Topics & Precedence
              </h3>
            </div>
            
            <p className="text-xs text-[var(--text-secondary)] opacity-60 mb-4">
              Demonstrates conflict resolution and preference isolation. Platform-specific topics take priority over authorized cross-platform topics.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Platform Topics */}
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    {selectedPlatform} Focus Topics
                  </span>
                  <span className="text-[10px] font-mono opacity-50">Priority 1</span>
                </div>
                {preferences.platform_topics && preferences.platform_topics.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {preferences.platform_topics.map(t => (
                      <span key={t} className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 font-mono text-xs border border-emerald-500/20">
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs opacity-40 italic">No topics recorded on this platform yet.</p>
                )}
              </div>

              {/* Authorized Global Topics */}
              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                    Shared Cross-Platform Topics
                  </span>
                  <span className="text-[10px] font-mono opacity-50">Priority 2 (Authorized)</span>
                </div>
                {preferences.global_topics && preferences.global_topics.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {preferences.global_topics.map(t => (
                      <span key={t} className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-300 font-mono text-xs border border-blue-500/20">
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs opacity-40 italic">No cross-platform topics shared.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Persistence Sequence Logs ──────────────────────────────────────── */}
        {context !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-secondary)] font-bold opacity-50">
                Persistence Sequence ({selectedPlatform})
              </h3>
              <span className="text-[10px] font-mono opacity-40 uppercase tracking-widest">
                {context.length} Interaction Nodes Found
              </span>
            </div>

            {context.length === 0 ? (
              <div className="glass p-16 flex flex-col items-center justify-center rounded-[32px] border border-[var(--border)] border-dashed">
                <Database size={40} className="mb-4 text-emerald-500 opacity-20" />
                <p className="text-xs font-semibold opacity-40">No intelligence traces located in the persistence layer for this platform.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {context.map((turn, i) => {
                  const isLocal = turn.platform_id === selectedPlatform
                  const isPrivate = turn.memory_scope === 'platform'

                  return (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass rounded-2xl border border-[var(--border)] overflow-hidden shadow-lg"
                    >
                      {/* Top Bar with Platform & Scope Badges */}
                      <div className="bg-[var(--surface-hover)] px-5 py-2.5 border-b border-[var(--border)] flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isLocal 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          }`}>
                            {turn.platform_id || 'axiom-web'}
                          </span>

                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isPrivate 
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {isPrivate ? <Lock size={10} /> : <Globe size={10} />}
                            {isPrivate ? 'PRIVATE' : 'GLOBAL'}
                          </span>
                        </div>

                        <span className="text-[10px] font-mono opacity-40">
                          {formatTimestamp(turn.timestamp)}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="p-5 space-y-4">
                        <div className="flex gap-3 items-start">
                          <div className="w-6 h-6 rounded bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[10px] font-bold opacity-50 shrink-0">
                            U
                          </div>
                          <p className="text-xs leading-relaxed opacity-90 font-medium pt-0.5">{turn.user}</p>
                        </div>
                        <div className="flex gap-3 items-start p-3 bg-[var(--surface-hover)] rounded-xl border border-[var(--border)] border-dashed">
                          <div className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm shadow-emerald-500/20">
                            A
                          </div>
                          <p className="text-xs leading-relaxed opacity-70 italic pt-0.5">
                            {turn.assistant}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
