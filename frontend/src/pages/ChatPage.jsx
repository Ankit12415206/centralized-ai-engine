import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Send, Mic, Image as ImageIcon, StopCircle, RefreshCw, 
  Trash2, ChevronDown, Check, Copy, Volume2, Square, Clock
} from 'lucide-react'
import { streamMessage, transcribeAudio, synthesizeSpeech, getSessionHistory } from '../utils/api'
import ReactMarkdown from 'react-markdown'
import { useTheme } from '../context/ThemeContext'

const ChatPage = () => {
  const { theme } = useTheme()
  const [messages, setMessages] = useState([
    { id: 0, role: 'assistant', content: 'Welcome to **AXIOM Intelligence**. How can I assist you today?' }
  ])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [language, setLanguage] = useState('en')
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  
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
      const history = await getSessionHistory(USER_ID, sessionId)
      setSessionId(sessionId)
      setMessages(history.map((m, i) => ({ ...m, id: i })))
    }
    const handleNew = () => {
      setSessionId(null)
      setMessages([{ id: 0, role: 'assistant', content: 'New session started. How can I help?' }])
    }

    window.addEventListener('load-session', handleLoad)
    window.addEventListener('new-chat', handleNew)
    return () => {
      window.removeEventListener('load-session', handleLoad)
      window.removeEventListener('new-chat', handleNew)
    }
  }, [])

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

    const userMessage = { id: Date.now(), role: 'user', content: input, image: imagePreview }
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
        platformId: 'axiom-web', 
        userId: USER_ID, 
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
        // Refresh sidebar sessions
        window.dispatchEvent(new CustomEvent('refresh-sessions'))
      },
      (err) => {
        setIsStreaming(false)
        console.error(err)
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
            {sessionId ? `Session: ${sessionId.slice(0,8)}...` : 'Axiom Intelligence'}
          </h2>
        </div>

        <div className="flex items-center gap-4">
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
          
          <button 
            onClick={() => { setMessages([{ id: 0, role: 'assistant', content: 'Context reset.' }]); setSessionId(null); }}
            className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-[var(--text-secondary)] hover:text-red-500"
            title="Clear Chat"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* ── Messages Area ─────────────────────────────────────────────────── */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-10 scroll-smooth scrollbar-hide"
      >
        <div className="max-w-3xl mx-auto space-y-10 pb-20">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-6 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`
                  w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-bold text-[10px]
                  ${msg.role === 'user' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-[var(--surface-hover)] border border-[var(--border)]'}
                `}>
                  {msg.role === 'user' ? 'U' : 'A'}
                </div>
                
                <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : ''}`}>
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
                          })
                        }}
                        className="p-1.5 hover:bg-[var(--surface-hover)] rounded-md text-[var(--text-secondary)]"
                      >
                        <Volume2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
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
              placeholder="Message Axiom..."
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
