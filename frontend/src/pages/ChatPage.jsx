import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Send, Mic, Image as ImageIcon, Trash2, ChevronDown, 
  Volume2, Square, Globe, Lock, Share2, AlertCircle, Layers
} from 'lucide-react'
import { streamMessage, transcribeAudio, synthesizeSpeech, getSessionHistory } from '../utils/api'
import ReactMarkdown from 'react-markdown'
import { useTheme } from '../context/ThemeContext'

const ChatPage = () => {
  const { theme } = useTheme()
  const [messages, setMessages] = useState([
    { 
      id: 0, 
      role: 'assistant', 
      content: 'Welcome to **AXIOM Intelligence**. Cross-platform memory isolation and permission gating are active.' 
    }
  ])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [language, setLanguage] = useState('en')
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Cross-Platform Controls
  const [platformId, setPlatformId] = useState('axiom-web')
  const [memoryScope, setMemoryScope] = useState('global') // 'global' | 'platform'
  
  const abortControllerRef = useRef(null)
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)

  const USER_ID = 'ankit_user'

  const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'Hindi' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
  ]

  // Listen for global session events
  useEffect(() => {
    const handleLoad = async (e) => {
      const { sessionId } = e.detail
      try {
        const history = await getSessionHistory(USER_ID, sessionId, platformId)
        setSessionId(sessionId)
        setMessages(history.map((m, i) => ({ ...m, id: i })))
      } catch (err) {
        console.error("Failed to load session history", err)
      }
    }
    const handleNew = () => {
      setSessionId(null)
      setMessages([{ id: 0, role: 'assistant', content: 'New session started. How can I help?' }])
      setErrorMsg('')
    }

    window.addEventListener('load-session', handleLoad)
    window.addEventListener('new-chat', handleNew)
    return () => {
      window.removeEventListener('load-session', handleLoad)
      window.removeEventListener('new-chat', handleNew)
    }
  }, [platformId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImage(reader.result.split(',')[1]) 
        setImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSend = async () => {
    if ((!input.trim() && !image) || isStreaming) return

    setErrorMsg('')
    const userMessage = { 
      id: Date.now(), 
      role: 'user', 
      content: input, 
      image: imagePreview,
      memoryScope
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setImage(null)
    setImagePreview(null)
    setIsStreaming(true)

    const aiMessageId = Date.now() + 1
    setMessages(prev => [...prev, { id: aiMessageId, role: 'assistant', content: '' }])

    abortControllerRef.current = streamMessage(
      { 
        message: input, 
        platformId, 
        userId: USER_ID,
        memoryScope,
        language, 
        sessionId,
        imageBase64: image
      },
      (chunk, sid) => {
        setSessionId(sid)
        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId ? { ...msg, content: msg.content + chunk } : msg
        ))
      },
      () => {
        setIsStreaming(false)
        window.dispatchEvent(new CustomEvent('refresh-sessions'))
      },
      (err) => {
        setIsStreaming(false)
        console.error("Streaming error:", err)
        setErrorMsg(err.message || 'Stream failed. Verify backend and platform permissions.')
      }
    )
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
    }
  }

  const handleVoiceToggle = async () => {
    if (isRecording) {
      window._currentRecorder?.stop()
      setIsRecording(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        const chunks = []
        recorder.ondataavailable = e => chunks.push(e.data)
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'audio/wav' })
          const text = await transcribeAudio(blob)
          if (text) setInput(text)
        }
        recorder.start()
        setIsRecording(true)
        window._currentRecorder = recorder
      } catch { alert('Mic access denied') }
    }
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-[var(--border)] shrink-0 glass z-20">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="font-display font-semibold text-[10px] tracking-widest opacity-60 uppercase">
            {sessionId ? `Session: ${sessionId.slice(0,8)}...` : 'AXIOM Intelligence'}
          </h2>

          {/* Active Platform Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-tight">
            <Layers size={10} />
            <span>{platformId}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Memory Scope Toggle (Global vs Platform-Private) */}
          <button
            onClick={() => setMemoryScope(s => s === 'global' ? 'platform' : 'global')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${
              memoryScope === 'global'
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
            }`}
            title={memoryScope === 'global' ? 'Global memory (shared if permitted)' : 'Private memory (strictly isolated to this platform)'}
          >
            {memoryScope === 'global' ? <Globe size={12} /> : <Lock size={12} />}
            <span>{memoryScope === 'global' ? 'Global Scope' : 'Private Scope'}</span>
          </button>

          {/* Language Selector */}
          <div className="relative group">
            <select 
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="appearance-none bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-4 py-1.5 pr-8 text-[10px] font-bold uppercase tracking-tight focus:outline-none transition-all cursor-pointer"
            >
              {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-[var(--bg)]">{l.label}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-40" />
          </div>
          
          {/* Clear Session */}
          <button 
            onClick={() => { setMessages([{ id: 0, role: 'assistant', content: 'Context reset.' }]); setSessionId(null); setErrorMsg(''); }}
            className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-[var(--text-secondary)] hover:text-red-500"
            title="Clear Chat View"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-500/10 border-b border-red-500/20 px-8 py-2 text-red-400 text-xs font-semibold flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg('')} className="text-xs hover:underline">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Messages Area ─────────────────────────────────────────────────── */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-10 scroll-smooth scrollbar-hide"
      >
        <div className="max-w-3xl mx-auto space-y-8 pb-20">
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              // Check if message content has cross-platform provenance tag
              const isCrossPlatform = typeof msg.content === 'string' && msg.content.includes('[From ')

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`
                    w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-bold text-[10px]
                    ${msg.role === 'user' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-[var(--surface-hover)] border border-[var(--border)]'}
                  `}>
                    {msg.role === 'user' ? 'U' : 'A'}
                  </div>
                  
                  <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                    {/* Provenance Banner if from external platform */}
                    {isCrossPlatform && (
                      <div className="flex items-center gap-1.5 mb-1.5 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-mono font-bold">
                        <Share2 size={10} />
                        <span>Authorized Cross-Platform Context</span>
                      </div>
                    )}

                    {msg.image && (
                      <img src={msg.image} alt="upload" className="max-w-sm rounded-xl mb-3 border border-[var(--border)] shadow-xl" />
                    )}

                    <div className={`
                      prose prose-sm dark:prose-invert max-w-none px-6 py-4 rounded-2xl
                      ${msg.role === 'user' 
                        ? 'bg-emerald-500 text-white selection:bg-white/20 shadow-lg shadow-emerald-500/10' 
                        : 'bg-[var(--surface-solid)] border border-[var(--border)] shadow-sm'}
                    `}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>

                    {msg.role === 'assistant' && msg.content && (
                      <div className="flex gap-2 mt-2 ml-1 opacity-40 hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            synthesizeSpeech(msg.content, language).then(src => {
                              const a = new Audio(src)
                              a.play()
                            }).catch(err => {
                              console.warn("TTS playback unavailable (environment dependent):", err)
                            })
                          }}
                          className="p-1.5 hover:bg-[var(--surface-hover)] rounded-md text-[var(--text-secondary)]"
                          title="Speak response"
                        >
                          <Volume2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Input Area ───────────────────────────────────────────────────── */}
      <div className="shrink-0 p-6 z-20">
        <div className="max-w-3xl mx-auto">
          
          <AnimatePresence>
            {imagePreview && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="mb-4 relative w-20 h-20 group"
              >
                <img src={imagePreview} className="w-full h-full object-cover rounded-xl border-2 border-emerald-500 shadow-xl" alt="preview" />
                <button 
                  onClick={() => { setImage(null); setImagePreview(null); }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative glass rounded-2xl shadow-2xl p-2 flex items-end gap-2 border-[var(--border)]">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload} 
            />
            
            <button 
              onClick={() => fileInputRef.current.click()}
              className="p-3 hover:bg-[var(--surface-hover)] rounded-xl text-[var(--text-secondary)] transition-all"
              title="Upload Image"
            >
              <ImageIcon size={18} />
            </button>

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder={`Message Axiom (${memoryScope === 'global' ? 'Global scope' : 'Private scope'})...`}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-3 px-2 resize-none max-h-48 scrollbar-hide"
              rows={1}
            />

            <div className="flex items-center gap-1.5 p-1">
              <button 
                onClick={handleVoiceToggle}
                className={`p-3 rounded-xl transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'}`}
                title="Voice Input"
              >
                <Mic size={18} />
              </button>

              {isStreaming ? (
                <button 
                  onClick={handleStop}
                  className="p-3 bg-[var(--surface-hover)] hover:bg-red-500/10 text-red-500 rounded-xl transition-all"
                  title="Stop Generation"
                >
                  <Square size={18} fill="currentColor" />
                </button>
              ) : (
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() && !image}
                  className={`p-3 rounded-xl transition-all ${(!input.trim() && !image) ? 'opacity-20' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'}`}
                  title="Send Message"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatPage
