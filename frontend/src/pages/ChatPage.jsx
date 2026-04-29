import React, { useState, useRef, useEffect, useCallback } from 'react'
import { streamMessage, transcribeAudio, synthesizeSpeech } from '../utils/api'
import ReactMarkdown from 'react-markdown'
import { useTheme } from '../context/ThemeContext'
import {
  Send, Mic, MicOff, Volume2, Trash2, Loader,
  StopCircle, ImagePlus, X, Pencil, Check, XCircle,
  Bot, User, Zap, Globe, Brain
} from 'lucide-react'

const USER_ID = 'user-' + Math.random().toString(36).slice(2, 9)
const PLATFORM_ID = 'web-dashboard'

/* ── Small reusable components ────────────────────────────────────────────── */

function IconBtn({ onClick, title, disabled, children, danger, active, accent }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '38px', height: '38px',
        borderRadius: '10px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: danger
          ? `1px solid ${hovered ? 'var(--danger)' : 'rgba(248,81,73,0.3)'}`
          : active
          ? '1px solid var(--accent-glow)'
          : accent
          ? '1px solid var(--accent)'
          : '1px solid var(--border)',
        background: danger
          ? hovered ? 'var(--danger)' : 'var(--danger-dim)'
          : active
          ? 'var(--accent-dim)'
          : accent
          ? 'var(--accent)'
          : hovered ? 'var(--surface2)' : 'var(--surface)',
        color: danger
          ? hovered ? 'white' : 'var(--danger)'
          : active
          ? 'var(--accent)'
          : accent
          ? 'var(--bg)'
          : hovered ? 'var(--text)' : 'var(--text2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.18s ease',
        transform: hovered && !disabled ? 'translateY(-1px)' : 'none',
        flexShrink: 0,
      }}>
      {children}
    </button>
  )
}

function TypingDots() {
  return (
    <div className="dot-loader" style={{ padding: '2px 0' }}>
      <span /><span /><span />
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────────────────────── */

export default function ChatPage() {
  const { isDark } = useTheme()
  const [messages, setMessages] = useState([
    {
      id: 0, role: 'assistant',
      content: 'Hello! I\'m the **Centralized AI Engine** — your unified intelligence layer.\n\nI support:\n- 🎙️ **Voice input** — click the mic\n- 🖼️ **Image analysis** — attach any image\n- 🌍 **14 languages** — switch from the dropdown\n- 🧠 **Context memory** — I remember our conversation\n- ⚡ **Real-time streaming** — watch me think out loud',
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
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [inputFocused, setInputFocused] = useState(false)

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const abortControllerRef = useRef(null)
  const fileInputRef = useRef(null)
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
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
    }
  }, [input])

  /* ── Send / Stream ────────────────────────────────────────────────────── */

  const handleSend = useCallback((overrideText, overrideImg) => {
    const msg = overrideText !== undefined ? overrideText : input.trim()
    const img = overrideImg !== undefined ? overrideImg : imageBase64
    if ((!msg && !img) || isStreaming) return

    setInput('')
    clearImage()

    const userMsgId = nextId()
    const assistantMsgId = nextId()
    const capturedPreview = imagePreview

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', content: msg, image: overrideImg !== undefined ? null : capturedPreview },
      { id: assistantMsgId, role: 'assistant', content: '', streaming: true },
    ])
    setIsStreaming(true)

    const controller = streamMessage(
      { message: msg, platformId: PLATFORM_ID, userId: USER_ID, language, sessionId, imageBase64: img },
      (chunk, sid) => {
        setSessionId(sid)
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m
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
            ? { ...m, content: '⚠️ Could not reach the AI Engine. Make sure the backend is running on port 8000.', streaming: false }
            : m
        ))
        setIsStreaming(false)
      }
    )
    abortControllerRef.current = controller
  }, [input, imageBase64, imagePreview, isStreaming, language, sessionId])

  /* ── Stop ─────────────────────────────────────────────────────────────── */

  const handleStop = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsStreaming(false)
    setMessages(prev => prev.map(m =>
      m.streaming ? { ...m, streaming: false, stopped: true } : m
    ))
  }

  /* ── Image ────────────────────────────────────────────────────────────── */

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImagePreview(ev.target.result)
      setImageBase64(ev.target.result.split(',')[1])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const clearImage = () => {
    setImagePreview(null)
    setImageBase64(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /* ── Edit prompt ──────────────────────────────────────────────────────── */

  const startEdit = (msg) => { setEditingId(msg.id); setEditText(msg.content) }
  const cancelEdit = () => { setEditingId(null); setEditText('') }

  const confirmEdit = (msgId) => {
    if (!editText.trim()) return
    const idx = messages.findIndex(m => m.id === msgId)
    if (idx === -1) return

    const trimmed = messages.slice(0, idx + 1).map(m =>
      m.id === msgId ? { ...m, content: editText } : m
    )
    setMessages(trimmed)
    setEditingId(null)
    const textToSend = editText
    setEditText('')

    setTimeout(() => {
      const assistantMsgId = nextId()
      setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', streaming: true }])
      setIsStreaming(true)

      const controller = streamMessage(
        { message: textToSend, platformId: PLATFORM_ID, userId: USER_ID, language, sessionId },
        (chunk, sid) => {
          setSessionId(sid)
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m
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
            m.id === assistantMsgId ? { ...m, content: '⚠️ Error reconnecting.', streaming: false } : m
          ))
          setIsStreaming(false)
        }
      )
      abortControllerRef.current = controller
    }, 60)
  }

  /* ── Voice ────────────────────────────────────────────────────────────── */

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []
      mediaRecorderRef.current.ondataavailable = e => audioChunksRef.current.push(e.data)
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        try {
          const text = await transcribeAudio(blob)
          if (text) { setInput(text); textareaRef.current?.focus() }
        } catch {}
      }
      mediaRecorderRef.current.start()
      setIsRecording(true)
    } catch { alert('Microphone access denied.') }
  }

  const stopRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false) }

  const speakMessage = async (text) => {
    setIsSpeaking(true)
    try {
      const src = await synthesizeSpeech(text, language)
      const audio = new Audio(src)
      audio.onended = () => setIsSpeaking(false)
      audio.play()
    } catch { setIsSpeaking(false) }
  }

  const clearChat = () => {
    setMessages([{ id: nextId(), role: 'assistant', content: 'Context cleared. Starting fresh! 🧹' }])
    setSessionId(null)
    clearImage()
  }

  const LANGUAGES = [
    { code: 'en', label: '🇬🇧 English' }, { code: 'hi', label: '🇮🇳 Hindi' },
    { code: 'pa', label: '🇮🇳 Punjabi' }, { code: 'fr', label: '🇫🇷 French' },
    { code: 'es', label: '🇪🇸 Spanish' }, { code: 'de', label: '🇩🇪 German' },
    { code: 'ar', label: '🇸🇦 Arabic' }, { code: 'zh-cn', label: '🇨🇳 Chinese' },
    { code: 'ja', label: '🇯🇵 Japanese' }, { code: 'ru', label: '🇷🇺 Russian' },
  ]

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', transition: 'background 0.3s' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px',
        height: '60px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        transition: 'all 0.3s',
        flexShrink: 0,
        gap: '12px',
      }}>
        {/* Left: title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Brain size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.03em' }}>
              AI ENGINE
            </span>
          </div>
          <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'DM Mono, monospace' }}>
            {USER_ID}
          </span>

          {/* Live indicator */}
          {isStreaming && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', animation: 'fadeIn 0.2s ease' }}>
              <div style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 6px var(--accent)',
                animation: 'glowPulse 1.2s ease-in-out infinite',
              }} />
              <span style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'DM Mono, monospace' }}>
                streaming
              </span>
            </div>
          )}
        </div>

        {/* Right: controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Language selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Globe size={13} style={{ color: 'var(--text3)' }} />
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          {/* Clear chat */}
          <IconBtn onClick={clearChat} title="Clear conversation" danger>
            <Trash2 size={15} />
          </IconBtn>
        </div>
      </header>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>

        {messages.map((msg, idx) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            idx={idx}
            isStreaming={isStreaming}
            editingId={editingId}
            editText={editText}
            setEditText={setEditText}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            confirmEdit={confirmEdit}
            speakMessage={speakMessage}
            isSpeaking={isSpeaking}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 20px 16px',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        transition: 'all 0.3s',
      }}>

        {/* Image preview */}
        {imagePreview && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            marginBottom: '10px', padding: '8px 12px',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-glow)',
            borderRadius: '10px',
            animation: 'fadeUp 0.25s ease',
          }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={imagePreview} alt="preview"
                style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', border: '1.5px solid var(--accent-glow)' }} />
              <button onClick={clearImage} style={{
                position: 'absolute', top: '-6px', right: '-6px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'var(--danger)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--bg)', cursor: 'pointer',
                transition: 'transform 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <X size={9} />
              </button>
            </div>
            <div>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>Image attached</p>
              <p style={{ fontSize: '11px', color: 'var(--text2)' }}>Type a question or just press Send</p>
            </div>
          </div>
        )}

        {/* Main input row */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: '8px',
          maxWidth: '860px', margin: '0 auto',
        }}>

          {/* Text area container */}
          <div style={{
            flex: 1,
            display: 'flex', alignItems: 'flex-end', gap: '6px',
            padding: '10px 14px',
            borderRadius: '16px',
            background: 'var(--bg)',
            border: `1.5px solid ${inputFocused ? 'var(--accent)' : 'var(--border)'}`,
            boxShadow: inputFocused ? '0 0 0 3px var(--accent-dim)' : 'none',
            transition: 'all 0.2s ease',
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              placeholder={isStreaming ? 'AI is responding...' : 'Type your message… (Shift+Enter for newline)'}
              disabled={isStreaming}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: '14px',
                lineHeight: '1.5',
                color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif',
                maxHeight: '140px',
                opacity: isStreaming ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
            {/* Image */}
            <IconBtn
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Attach image"
              active={!!imagePreview}>
              <ImagePlus size={16} />
            </IconBtn>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />

            {/* Mic */}
            <IconBtn
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isStreaming}
              title={isRecording ? 'Stop recording' : 'Voice input'}
              danger={isRecording}>
              {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
            </IconBtn>

            {/* Stop / Send */}
            {isStreaming ? (
              <IconBtn onClick={handleStop} title="Stop generation" danger>
                <StopCircle size={16} />
              </IconBtn>
            ) : (
              <IconBtn
                onClick={() => handleSend()}
                disabled={(!input.trim() && !imageBase64)}
                title="Send message"
                accent={!!(input.trim() || imageBase64)}>
                <Send size={16} />
              </IconBtn>
            )}
          </div>
        </div>

        {/* Hints */}
        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginTop: '8px', fontFamily: 'DM Mono, monospace' }}>
          Enter to send · Shift+Enter for newline · Hover messages to edit
        </p>
      </div>
    </div>
  )
}

/* ── Message Row ──────────────────────────────────────────────────────────── */

function MessageRow({ msg, idx, isStreaming, editingId, editText, setEditText, startEdit, cancelEdit, confirmEdit, speakMessage, isSpeaking }) {
  const [hovered, setHovered] = useState(false)
  const isUser = msg.role === 'user'
  const isEditing = editingId === msg.id

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        padding: '3px 20px',
        animation: `${isUser ? 'slideRight' : 'slideLeft'} 0.3s cubic-bezier(0.16,1,0.3,1) both`,
        animationDelay: `${Math.min(idx * 0.02, 0.1)}s`,
        position: 'relative',
      }}>

      {/* AI avatar */}
      {!isUser && (
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent)', flexShrink: 0, marginRight: '10px',
          marginTop: '4px',
        }}>
          <Bot size={14} />
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: '680px', minWidth: '40px' }}>

        {/* Edit mode */}
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', animation: 'scaleIn 0.2s ease' }}>
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit(msg.id) }
                if (e.key === 'Escape') cancelEdit()
              }}
              autoFocus
              style={{
                width: '100%', minWidth: '320px',
                padding: '12px 14px',
                borderRadius: '14px',
                background: 'var(--bg)',
                border: '2px solid var(--accent)',
                boxShadow: '0 0 0 3px var(--accent-dim)',
                color: 'var(--text)',
                fontSize: '14px',
                fontFamily: 'DM Sans, sans-serif',
                lineHeight: '1.5',
                resize: 'none',
                outline: 'none',
                minHeight: '80px',
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={cancelEdit}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                  background: 'var(--surface2)', color: 'var(--text2)',
                  border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <XCircle size={12} /> Cancel
              </button>
              <button
                onClick={() => confirmEdit(msg.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  background: 'var(--accent)', color: 'var(--bg)',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <Check size={12} /> Send
              </button>
            </div>
          </div>
        ) : (
          /* Normal bubble */
          <div>
            <div style={{
              padding: '12px 16px',
              borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: isUser ? 'var(--accent-dim)' : 'var(--surface)',
              border: `1px solid ${isUser ? 'var(--accent-glow)' : 'var(--border)'}`,
              color: 'var(--text)',
              fontSize: '14px',
              lineHeight: '1.6',
              transition: 'background 0.3s, border-color 0.3s',
              boxShadow: hovered ? 'var(--shadow)' : 'none',
            }}>
              {/* Attached image */}
              {msg.image && (
                <img src={msg.image} alt="attachment"
                  style={{ maxHeight: '220px', maxWidth: '100%', borderRadius: '10px', marginBottom: '10px', display: 'block', border: '1px solid var(--border)' }} />
              )}

              {/* Message text */}
              {msg.streaming && !msg.content ? (
                <TypingDots />
              ) : (
                <div className="prose">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  {msg.streaming && <span className="typing-cursor" />}
                </div>
              )}

              {/* Stopped badge */}
              {msg.stopped && (
                <div style={{
                  marginTop: '8px', paddingTop: '8px',
                  borderTop: '1px solid var(--border)',
                  fontSize: '11px', color: 'var(--text3)',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontFamily: 'DM Mono, monospace',
                }}>
                  <StopCircle size={11} /> generation stopped
                </div>
              )}

              {/* AI message footer */}
              {!isUser && !msg.streaming && msg.content && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginTop: '8px', paddingTop: '8px',
                  borderTop: '1px solid var(--border)',
                  opacity: hovered ? 1 : 0,
                  transition: 'opacity 0.2s',
                }}>
                  <button
                    onClick={() => speakMessage(msg.content)}
                    title="Read aloud"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: isSpeaking ? 'var(--accent)' : 'var(--text3)',
                      display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '11px', fontFamily: 'DM Mono, monospace',
                      transition: 'color 0.15s',
                      padding: '2px 4px', borderRadius: '4px',
                    }}>
                    <Volume2 size={12} />
                    {isSpeaking ? 'speaking...' : 'listen'}
                  </button>
                </div>
              )}
            </div>

            {/* Edit button for user messages */}
            {isUser && !isStreaming && (
              <div style={{
                display: 'flex', justifyContent: 'flex-end',
                marginTop: '4px',
                opacity: hovered ? 1 : 0,
                transition: 'opacity 0.2s',
              }}>
                <button
                  onClick={() => startEdit(msg)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '3px 8px', borderRadius: '6px',
                    background: 'var(--surface2)', color: 'var(--text3)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                    fontSize: '11px', fontFamily: 'DM Mono, monospace',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                  <Pencil size={10} /> edit
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent)', flexShrink: 0, marginLeft: '10px',
          marginTop: '4px',
        }}>
          <User size={14} />
        </div>
      )}
    </div>
  )
}
