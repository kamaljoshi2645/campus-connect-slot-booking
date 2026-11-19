import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './Chatbot.css'

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api'

const welcomeMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi! 👋 Welcome to Campus Connect.\n\nI'm your Campus AI Assistant. I can help you explore campuses, find available meeting slots, understand the booking process, and answer questions about the platform.\n\nHow can I help you today?",
}

const suggestions = [
  'How do I book a session?',
  'Explore available campuses',
  'Show available time slots',
  'What is Campus Connect?',
  'How can I cancel a booking?',
]

function ChatIcon({ close = false }) {
  return close ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.2-3.1A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8.5 11.5h.01m3.49 0h.01m3.49 0h.01" />
    </svg>
  )
}

function CampusChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [messages, setMessages] = useState([welcomeMessage])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [mode, setMode] = useState('loading')
  const messageEndRef = useRef(null)
  const inputRef = useRef(null)
  const closeTimerRef = useRef(null)

  const openChat = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setIsClosing(false)
    setIsOpen(true)
  }

  const closeChat = () => {
    setIsClosing(true)
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false)
      setIsClosing(false)
    }, 180)
  }

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${API_URL}/chat/status`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.message || 'Chat status unavailable')
        setMode(result.mode === 'ai' ? 'ai' : 'demo')
      })
      .catch(() => {
        if (!controller.signal.aborted) setMode('offline')
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isTyping, isOpen])

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeChat()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const sendMessage = async (value = input) => {
    const content = value.trim()
    if (!content || isTyping) return

    const userMessage = { id: `user-${messages.length}`, role: 'user', content }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setIsTyping(true)

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          messages: nextMessages.slice(-12).map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Chat response unavailable')

      setMode(result.mode === 'ai' ? 'ai' : 'demo')
      const assistantId = `assistant-${nextMessages.length}`
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: assistantId,
          role: 'assistant',
          content: result.response,
        },
      ])
    } catch {
      const errorId = `error-${nextMessages.length}`
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: errorId,
          role: 'assistant',
          content: "Sorry, I couldn't get a response just now. Please try again, or use the Home, Venues, and Schedule pages for current details.",
          isError: true,
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  const clearChat = () => {
    setMessages([welcomeMessage])
    setInput('')
  }

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  return createPortal(
    <div className="campus-chat">
      {isOpen && (
        <section
          className={`campus-chat-panel${isClosing ? ' is-closing' : ''}`}
          role="dialog"
          aria-label="Campus AI Assistant"
        >
          <header className="campus-chat-header">
            <div className="campus-chat-brand">
              <span className="campus-chat-brand-icon"><ChatIcon /></span>
              <div>
                <h2>Campus AI Assistant</h2>
                <span className={`campus-chat-mode ${mode === 'offline' ? 'is-offline' : ''}`}>
                  <span className="campus-chat-online-dot" />
                  {mode === 'ai' ? 'AI assistant online' : mode === 'demo' ? 'Demo mode · campus guide' : mode === 'offline' ? 'Assistant unavailable' : 'Connecting'}
                </span>
              </div>
            </div>
            <div className="campus-chat-header-actions">
              <button type="button" className="campus-chat-clear" onClick={clearChat} disabled={isTyping}>
                Clear chat
              </button>
              <button type="button" className="campus-chat-close" onClick={closeChat} aria-label="Close chat">
                <ChatIcon close />
              </button>
            </div>
          </header>

          <div className="campus-chat-messages" role="log" aria-live="polite" aria-relevant="additions">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`campus-chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}${message.isError ? ' is-error' : ''}`}
              >
                {message.role === 'assistant' && <span className="campus-chat-avatar" aria-hidden="true">C</span>}
                <p>{message.content}</p>
              </div>
            ))}

            {messages.length === 1 && !isTyping && (
              <div className="campus-chat-suggestions">
                <span>Try asking</span>
                {suggestions.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => sendMessage(suggestion)}>
                    {suggestion}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            )}

            {isTyping && (
              <div className="campus-chat-message is-assistant campus-chat-typing" role="status" aria-label="Assistant is typing">
                <span className="campus-chat-avatar" aria-hidden="true">C</span>
                <p><span /><span /><span /></p>
              </div>
            )}
            <div ref={messageEndRef} />
          </div>

          <form
            className="campus-chat-composer"
            onSubmit={(event) => {
              event.preventDefault()
              sendMessage()
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ask about campuses, booking, or sessions..."
              aria-label="Message Campus AI Assistant"
              rows={1}
              maxLength={1000}
              disabled={isTyping}
            />
            <button type="submit" disabled={!input.trim() || isTyping} aria-label="Send message">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7.2 18-3.4-7.4L3 10.2 21 3Z" /><path d="M10.4 13.6 21 3" /></svg>
            </button>
            <span className="campus-chat-composer-hint">Enter to send · Shift + Enter for a new line</span>
          </form>
        </section>
      )}

      <button
        type="button"
        className={`campus-chat-launcher${isOpen ? ' is-open' : ''}`}
        onClick={isOpen ? closeChat : openChat}
        aria-label={isOpen ? 'Close Campus AI Assistant' : 'Open Campus AI Assistant'}
        aria-expanded={isOpen}
        title="Campus AI Assistant"
      >
        <ChatIcon close={isOpen} />
      </button>
    </div>,
    document.body,
  )
}

export default CampusChatbot
