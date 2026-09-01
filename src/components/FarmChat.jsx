import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { buildSummary } from '../lib/farmSummary'
import { friendlyError, rateLimitMessage } from '../lib/aiErrors'
import { Card, Button } from './ui'

// Conversation is kept ONLY in this browser (localStorage) — nothing is saved
// on the server, so it adds no storage. It won't follow you to another device.
const CHAT_KEY = 'avrico:chat'
const firstName = (p) => (p?.full_name || '').trim().split(/\s+/)[0] || ''

const loadChat = () => {
  try { const v = JSON.parse(localStorage.getItem(CHAT_KEY) || 'null'); return Array.isArray(v) && v.length ? v : null }
  catch { return null }
}
const saveChat = (m) => { try { localStorage.setItem(CHAT_KEY, JSON.stringify(m.slice(-40))) } catch { /* ignore */ } }

export default function FarmChat() {
  const { profile } = useAuth()
  const name = firstName(profile)
  const [messages, setMessages] = useState(() => loadChat() ?? [])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const summaryRef = useRef(null)
  const logRef = useRef(null)

  // Set/refresh the welcome until a real conversation starts (so the name shows
  // once the profile has loaded).
  useEffect(() => {
    setMessages((cur) => (cur.length > 1 ? cur
      : [{ role: 'model', text: `Hello${name ? ' ' + name : ''}, how can I help you today?` }]))
  }, [name])

  useEffect(() => { if (messages.length) saveChat(messages) }, [messages])
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [messages, busy])

  const send = async (e) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput(''); setError(null)
    const history = [...messages, { role: 'user', text }]
    setMessages(history)
    setBusy(true)
    try {
      if (!summaryRef.current) summaryRef.current = await buildSummary()
      // Send the recent turns; drop the leading welcome so it starts with a user turn.
      const convo = history.map((m) => ({ role: m.role, text: m.text }))
      while (convo.length && convo[0].role === 'model') convo.shift()
      const { data, error: fnErr } = await supabase.functions.invoke('insights', {
        body: { messages: convo.slice(-20), summary: summaryRef.current },
      })
      if (fnErr) {
        let b = null
        try { b = await fnErr.context.json() } catch { /* ignore */ }
        if (b?.rate_limited) throw new Error(rateLimitMessage(b.retry_after_seconds))
        throw new Error(b?.error || fnErr.message)
      }
      if (data?.error) throw new Error(data.error)
      setMessages([...history, { role: 'model', text: data.reply }])
    } catch (err) {
      setError(friendlyError(err.message))
    } finally { setBusy(false) }
  }

  const clear = () => {
    const w = [{ role: 'model', text: `Hello${name ? ' ' + name : ''}, how can I help you today?` }]
    setMessages(w); saveChat(w); setError(null)
  }

  return (
    <Card>
      <div className="chat-head">
        <h2>Ask AI</h2>
        {messages.length > 1 && <button className="link" onClick={clear}>Clear chat</button>}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Ask about your trees, zones, tasks or stock — or for farming advice. This chat is kept on this device only.
      </p>

      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>{m.text}</div>
        ))}
        {busy && (
          <div className="chat-msg chat-model chat-typing" aria-label="Assistant is typing">
            <span></span><span></span><span></span>
          </div>
        )}
      </div>

      {error && <div className="banner banner-error" style={{ marginTop: 10 }}>{error}</div>}

      <form className="chat-input" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your farm…"
          disabled={busy}
          aria-label="Message"
        />
        <Button type="submit" disabled={busy || !input.trim()}>Send</Button>
      </form>
    </Card>
  )
}
