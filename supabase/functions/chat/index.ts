// Supabase Edge Function: chat
// ----------------------------------------------------------------------------
// Owner-only "Ask AI" chat, backed by Google Gemini (free tier). Takes the
// recent conversation plus a farm-data snapshot and returns a reply. The Gemini
// key stays here on the server — never in the public frontend.
//
// It shares the SAME project secrets as the `insights` function, so you don't
// need to set the key again:
//   GEMINI_API_KEY   (required)   — from aistudio.google.com/apikey
//   GEMINI_MODEL     (optional)   — defaults to gemini-3.6-flash
//
// Deploy (easiest on a phone): Supabase dashboard -> Edge Functions ->
//   "Deploy a new function" / "Create function" -> name it exactly `chat`
//   -> paste this whole file -> Deploy.
// ----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function chatSystem(summary: unknown) {
  return [
    'You are the friendly AI assistant for Avrico Estates, an avocado farm in Malawi. You help the owner.',
    'Use the farm data snapshot below to answer questions about trees, zones, statuses, tasks and stock with real numbers.',
    'If a question is not covered by the data, answer from general avocado/farming knowledge and say when you are giving general advice.',
    'Keep answers concise, practical and plain. For big decisions, remind them to confirm on the ground.',
    '',
    'FARM DATA SNAPSHOT:',
    JSON.stringify(summary),
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'

    if (!geminiKey) {
      return json({ error: 'AI is not set up yet. Add the GEMINI_API_KEY secret in Supabase to enable this.' }, 400)
    }

    // 1) Who is calling?
    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: me } = await caller.auth.getUser()
    if (!me?.user) return json({ error: 'Not signed in.' }, 401)

    // 2) Owners only.
    const { data: profile } = await caller
      .from('profiles').select('role, active').eq('id', me.user.id).single()
    if (!profile || profile.role !== 'owner' || !profile.active) {
      return json({ error: 'Only owners can use the AI features.' }, 403)
    }

    // 3) Build the conversation and ask Gemini.
    const body = await req.json().catch(() => ({}))
    const messages = Array.isArray(body?.messages) ? body.messages : []
    const contents = messages
      .filter((m: { role?: string; text?: string }) => (m?.role === 'user' || m?.role === 'model') && typeof m?.text === 'string')
      .map((m: { role: string; text: string }) => ({ role: m.role, parts: [{ text: m.text }] }))
    if (contents.length === 0) return json({ error: 'No message provided.' }, 400)

    const res = await callGemini(model, geminiKey, {
      systemInstruction: { parts: [{ text: chatSystem(body?.summary ?? {}) }] },
      contents,
      generationConfig: { temperature: 0.5 },
    })
    if (res.errorResponse) return res.errorResponse
    return json({ reply: (res.text || '').trim() || "Sorry, I couldn't come up with an answer just now." })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

async function callGemini(model: string, key: string, payload: unknown): Promise<{ text?: string; errorResponse?: Response }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
  )
  if (!res.ok) {
    const raw = await res.text()
    if (res.status === 429) {
      let retry: number | null = null
      try {
        const j = JSON.parse(raw)
        for (const d of j?.error?.details ?? []) {
          const m = typeof d?.retryDelay === 'string' ? d.retryDelay.match(/(\d+)s/) : null
          if (m) retry = Number(m[1])
        }
      } catch { /* ignore */ }
      return { errorResponse: json({ rate_limited: true, retry_after_seconds: retry, error: 'Free AI usage limit reached.' }, 429) }
    }
    return { errorResponse: json({ error: `The AI service returned an error (${res.status}). ${raw.slice(0, 400)}` }, 502) }
  }
  const data = await res.json()
  return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '' }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
