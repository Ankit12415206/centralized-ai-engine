import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { streamMessage, transcribeAudio, synthesizeSpeech } from '../utils/api'
import ReactMarkdown from 'react-markdown'
import { useTheme } from '../context/ThemeContext'
import {
  Send, Mic, MicOff, Volume2, Trash2, Loader,
  StopCircle, ImagePlus, X, Pencil, Check, XCircle,
  Bot, User, Zap, Globe, Brain, Sparkles, ChevronDown
} from 'lucide-react'

const USER_ID = 'user-' + Math.random().toString(36).slice(2, 9)
const PLATFORM_ID = 'web-dashboard'

/* ── UI Components ────────────────────────────────────────────────────────── */

function ActionButton({ onClick, icon: Icon, title, disabled, danger, accent, active }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`
        flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 border
        ${danger ? 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' : 
          accent ? 'bg-emerald-500 border-emerald-400 text-black hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]' :
          active ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' :
          'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <Icon size={18} />
    </motion.button>
  )
}

/* ── Main Component ───────────────────────────────────────────────────────── */

export default function ChatPage() {
  const { isDark } = useTheme()
  const [messages, setMessages] = useState([
    {
      id: 0, role: 'assistant',
      content: 'Welcome to the **Centralized AI Engine**. I am your persistent intelligence layer, capable of voice interaction, vision, and multilingual support across all your platforms.',
    }
  ])
  const [input, setInput] = useState('')
  const [language, setLanguage] = useState('en')
  const [sessionId, setSessionId] = useState(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageBase64, setImageBase64] = useState(null)
  const [inputFocused, setInputFocused] = useState(false)

  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)
  const textareaRef = useRef(null)
  const msgCounter = useRef(1)

  const nextId = () => ++msgCounter.current

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

  const handleSend = useCallback((overrideText) => {
    const msg = overrideText !== undefined ? overrideText : input.trim()
    if ((!msg && !imageBase64) || isStreaming) return

    setInput('')
    const capturedImg = imagePreview
    const capturedBase64 = imageBase64
    setImagePreview(null)
    setImageBase64(null)

    const userMsgId = nextId()
    const assistantMsgId = nextId()

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', content: msg, image: capturedImg },
      { id: assistantMsgId, role: 'assistant', content: '', streaming: true },
    ])
    setIsStreaming(true)

    // PERF: Batching updates for high-speed streaming
    let accumulatedText = ""
    const controller = streamMessage(
      { message: msg, platformId: PLATFORM_ID, userId: USER_ID, language, sessionId, imageBase64: capturedBase64 },
      (chunk, sid) => {
        setSessionId(sid)
        accumulatedText += chunk
        // Use functional update to ensure we always have latest state
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
        ))
      },
      (sid) => {
        setSessionId(sid)
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, streaming: false } : m
        ))
        setIsStreaming(false)
        abortControllerRef.current = null
      },
      () => {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: '⚠️ Engine unreachable. Please verify backend connectivity.', streaming: false }
            : m
        ))
        setIsStreaming(false)
      }
    )
    abortControllerRef.current = controller
  }, [input, imageBase64, imagePreview, isStreaming, language, sessionId])

  const handleStop = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsStreaming(false)
    setMessages(prev => prev.map(m =>
      m.streaming ? { ...m, streaming: false, stopped: true } : m
    ))
  }

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImagePreview(ev.target.result)
      setImageBase64(ev.target.result.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []
      recorder.ondataavailable = e => chunks.push(e.data)
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/wav' })
        try {
          const text = await transcribeAudio(blob)
          if (text) setInput(text)
        } catch {}
      }
      recorder.start()
      setIsRecording(true)
      recorder.stream.getTracks().forEach(track => {
        track.onended = () => setIsRecording(false)
      })
      window._currentRecorder = recorder
    } catch { alert('Microphone access denied.') }
  }

  const stopRecording = () => {
    window._currentRecorder?.stop()
    setIsRecording(false)
  }

  const speakMessage = async (text) => {
    setIsSpeaking(true)
    try {
      const src = await synthesizeSpeech(text, language)
      const audio = new Audio(src)
      audio.onended = () => setIsSpeaking(false)
      audio.play()
    } catch { setIsSpeaking(false) }
  }

  const LANGUAGES = [
    { code: 'en', label: 'English' }, { code: 'hi', label: 'Hindi' },
    { code: 'pa', label: 'Punjabi' }, { code: 'fr', label: 'French' },
    { code: 'es', label: 'Spanish' }, { code: 'de', label: 'German' },
    { code: 'zh-cn', label: 'Chinese' }, { code: 'ja', label: 'Japanese' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#050505] text-white">
      
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="glass-panel flex items-center justify-between px-6 h-16 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center">
              <Brain size={18} className="text-emerald-400" />
            </div>
            <h1 className="font-display font-semibold text-sm tracking-tight text-white/90">
              CORE ENGINE <span className="text-emerald-400/60 ml-1 font-normal opacity-50">v2.1</span>
            </h1>
          </div>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-full border border-white/5">
             <div className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
             <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{isStreaming ? 'Processing' : 'Idle'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <select 
              value={language} 
              onChange={e => setLanguage(e.target.value)}
              className="appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-1.5 pr-8 text-xs font-medium focus:outline-none focus:border-emerald-500/50 transition-all cursor-pointer hover:bg-white/10"
            >
              {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-[#121212]">{l.label}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/30" />
          </div>
          
          <button 
            onClick={() => { setMessages([{ id: 0, role: 'assistant', content: 'Context cleared.' }]); setSessionId(null); }}
            className="p-2 text-white/40 hover:text-red-400 transition-colors"
            title="Reset Context"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-8 space-y-8 scroll-smooth">
        <div className="max-w-3xl mx-auto space-y-8">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border ${
                  msg.role === 'user' ? 'bg-white/5 border-white/10 text-white/60' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>

                {/* Bubble */}
                <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.image && (
                    <motion.img 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      src={msg.image} 
                      className="max-h-60 rounded-2xl border border-white/10 shadow-2xl mb-1" 
                    />
                  )}
                  <div className={`
                    message-bubble glass-card px-5 py-3.5
                    ${msg.role === 'user' ? 'bg-emerald-500/10 border-emerald-500/20 text-white/90' : 'bg-white/[0.03] border-white/10 text-white/80'}
                  `}>
                    {msg.streaming && !msg.content ? (
                      <div className="flex gap-1.5 py-2">
                        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }} className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.2 }} className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.4 }} className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                      </div>
                    ) : (
                      <div className="prose prose-invert max-w-none prose-sm leading-relaxed">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                        {msg.streaming && <span className="typing-cursor" />}
                      </div>
                    )}
                  </div>
                  
                  {/* Actions under bubble */}
                  {!msg.streaming && msg.content && msg.role === 'assistant' && (
                    <motion.button
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      onClick={() => speakMessage(msg.content)}
                      className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider font-mono text-white/30 hover:text-emerald-400 transition-colors"
                    >
                      {isSpeaking ? <Loader size={10} className="animate-spin" /> : <Volume2 size={10} />}
                      {isSpeaking ? 'Speaking' : 'Listen'}
                    </motion.button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Area ────────────────────────────────────────────────────── */}
      <footer className="shrink-0 p-6 z-20">
        <div className="max-w-3xl mx-auto relative">
          
          {/* Preview Container */}
          <AnimatePresence>
            {imagePreview && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute bottom-full left-0 mb-4 flex items-center gap-3 p-3 glass-panel rounded-2xl border border-white/10"
              >
                <div className="relative group">
                  <img src={imagePreview} className="w-16 h-16 object-cover rounded-xl border border-white/20" />
                  <button 
                    onClick={() => { setImagePreview(null); setImageBase64(null); }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center border-2 border-black shadow-lg"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="pr-4">
                  <p className="text-xs font-semibold text-white/80">Image attached</p>
                  <p className="text-[10px] text-white/40">Ready for analysis</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Input Bar */}
          <div className={`
            glass-panel rounded-[24px] p-2 flex items-end gap-2 border transition-all duration-300
            ${inputFocused ? 'border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.1)]' : 'border-white/10'}
          `}>
            
            <div className="flex-1 flex flex-col px-3 py-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                }}
                placeholder={isStreaming ? "AI is typing..." : "Message AI Engine..."}
                disabled={isStreaming}
                className="w-full bg-transparent border-none outline-none text-sm leading-relaxed py-2 resize-none placeholder:text-white/20 text-white/90"
                style={{ height: '40px' }}
                rows={1}
              />
            </div>

            <div className="flex items-center gap-1 p-1">
              <input type="file" className="hidden" id="img-upload" accept="image/*" onChange={handleImageSelect} />
              <label htmlFor="img-upload">
                <ActionButton icon={ImagePlus} title="Attach Image" disabled={isStreaming} active={!!imagePreview} onClick={() => {}} />
              </label>
              
              <ActionButton 
                onClick={isRecording ? stopRecording : startRecording} 
                icon={isRecording ? MicOff : Mic} 
                danger={isRecording} 
                title={isRecording ? "Stop Recording" : "Voice Input"} 
                disabled={isStreaming}
              />

              {isStreaming ? (
                <ActionButton onClick={handleStop} icon={StopCircle} danger title="Stop Generating" />
              ) : (
                <ActionButton 
                  onClick={() => handleSend()} 
                  icon={Send} 
                  accent 
                  disabled={!input.trim() && !imageBase64} 
                  title="Send Message" 
                />
              )}
            </div>
          </div>

          <div className="flex justify-center mt-3">
             <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em]">
               Press enter to send · shift+enter for new line
             </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
