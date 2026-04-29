import React, { useState } from 'react'
import { getUserContext, clearUserContext } from '../utils/api'
import { useTheme } from '../context/ThemeContext'
import { Database, Trash2, RefreshCw, Clock, MessageSquare, User, Bot, Zap, Activity } from 'lucide-react'

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
    catch { setError('Could not fetch context. Is the backend running on port 8000?'); setContext(null) }
    finally { setLoading(false) }
  }

  const handleClear = async () => {
    if (!userId.trim()) return
    try { await clearUserContext(userId.trim()); setContext([]); setCleared(true) }
    catch { setError('Failed to clear context.') }
  }

  const stats = context ? [
    { label: 'Total Turns', value: context.length, icon: MessageSquare, color: 'var(--accent)' },
    { label: 'Sessions', value: [...new Set(context.map(c => c.session_id))].length, icon: Activity, color: 'var(--accent2)' },
    { label: 'Last Active', value: context.length ? new Date(context[context.length - 1].timestamp).toLocaleDateString() : '—', icon: Clock, color: '#e3b341' },
  ] : []

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg)', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px', animation: 'fadeUp 0.4s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent)',
            }}>
              <Database size={17} />
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.03em' }}>
              CONTEXT DASHBOARD
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', paddingLeft: '46px' }}>
            Inspect and manage stored conversation memory for any user.
          </p>
        </div>

        {/* Lookup card */}
        <div style={{
          borderRadius: '16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          padding: '20px',
          marginBottom: '20px',
          animation: 'fadeUp 0.4s ease 0.05s both',
          transition: 'background 0.3s, border-color 0.3s',
        }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', marginBottom: '12px', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em' }}>
            USER LOOKUP
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={userId}
              onChange={e => setUserId(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={e => e.key === 'Enter' && fetchContext()}
              placeholder="Enter user ID  (e.g. user-abc123)"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'var(--bg)',
                border: `1.5px solid ${inputFocused ? 'var(--accent)' : 'var(--border)'}`,
                boxShadow: inputFocused ? '0 0 0 3px var(--accent-dim)' : 'none',
                color: 'var(--text)',
                fontSize: '13px',
                fontFamily: 'DM Mono, monospace',
                outline: 'none',
                transition: 'all 0.2s',
              }}
            />
            <button
              onClick={fetchContext}
              disabled={loading || !userId.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px',
                borderRadius: '10px',
                background: 'var(--accent)',
                color: 'var(--bg)',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                opacity: !userId.trim() ? 0.5 : 1,
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => { if (userId.trim()) e.currentTarget.style.filter = 'brightness(1.1)' }}
              onMouseLeave={e => e.currentTarget.style.filter = 'none'}
            >
              <RefreshCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
              {loading ? 'Loading…' : 'Fetch'}
            </button>
            <button
              onClick={handleClear}
              disabled={!userId.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'var(--danger-dim)',
                color: 'var(--danger)',
                border: '1px solid rgba(248,81,73,0.25)',
                cursor: !userId.trim() ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                opacity: !userId.trim() ? 0.5 : 1,
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => { if (userId.trim()) { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = 'white' } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--danger-dim)'; e.currentTarget.style.color = 'var(--danger)' }}
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>

          {/* Feedback */}
          {error && (
            <div style={{
              marginTop: '10px', padding: '8px 12px', borderRadius: '8px',
              background: 'var(--danger-dim)', border: '1px solid rgba(248,81,73,0.25)',
              color: 'var(--danger)', fontSize: '12px', animation: 'fadeIn 0.2s ease',
            }}>
              ⚠️ {error}
            </div>
          )}
          {cleared && (
            <div style={{
              marginTop: '10px', padding: '8px 12px', borderRadius: '8px',
              background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
              color: 'var(--accent)', fontSize: '12px', animation: 'fadeIn 0.2s ease',
              fontFamily: 'DM Mono, monospace',
            }}>
              ✓ Context cleared successfully.
            </div>
          )}
        </div>

        {/* Results */}
        {context !== null && (
          <div style={{ animation: 'fadeUp 0.35s ease both' }}>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              {stats.map((s, i) => (
                <div key={s.label} style={{
                  borderRadius: '14px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '16px',
                  animation: `fadeUp 0.3s ease ${i * 0.07}s both`,
                  transition: 'background 0.3s, border-color 0.3s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: 'var(--text2)' }}>
                    <s.icon size={13} />
                    <span style={{ fontSize: '11px', fontFamily: 'DM Mono, monospace', letterSpacing: '0.04em' }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: s.color, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* History */}
            {context.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px 0',
                background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)',
              }}>
                <Database size={32} style={{ color: 'var(--text3)', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--text2)', fontSize: '14px' }}>No context found for this user.</p>
                <p style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '4px' }}>Start a conversation in the Chat tab first.</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em' }}>
                  INTERACTION HISTORY · {context.length} turn{context.length !== 1 ? 's' : ''}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {context.map((turn, i) => (
                    <div key={i} style={{
                      borderRadius: '14px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                      animation: `fadeUp 0.3s ease ${i * 0.04}s both`,
                      transition: 'background 0.3s, border-color 0.3s',
                    }}>
                      {/* Turn header */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px',
                        background: 'var(--surface2)',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        <div style={{
                          fontSize: '11px', fontFamily: 'DM Mono, monospace',
                          color: 'var(--accent2)',
                          background: 'var(--accent2-dim)', border: '1px solid rgba(88,166,255,0.2)',
                          padding: '2px 8px', borderRadius: '20px',
                        }}>
                          {turn.session_id?.slice(0, 8)}…
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'DM Mono, monospace' }}>
                          {new Date(turn.timestamp).toLocaleString()}
                        </span>
                      </div>

                      {/* Turn body */}
                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <div style={{
                            width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                            background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--accent)', marginTop: '1px',
                          }}>
                            <User size={11} />
                          </div>
                          <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.5', flex: 1 }}>
                            {turn.user}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <div style={{
                            width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                            background: 'var(--surface2)', border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text2)', marginTop: '1px',
                          }}>
                            <Bot size={11} />
                          </div>
                          <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.5', flex: 1 }}>
                            {turn.assistant?.slice(0, 240)}{turn.assistant?.length > 240 ? '…' : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
