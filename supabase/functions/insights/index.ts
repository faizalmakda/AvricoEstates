// Supabase Edge Function: insights
// ----------------------------------------------------------------------------
// Owner-only AI helper backed by Google Gemini (free tier). Handles two things,
// chosen by the request body:
//   • { summary }            -> prioritised farm recommendations (Insights page)
//   • { messages, summary }  -> a chat reply (Ask AI assistant)
// The Gemini API key stays here on the server — never in the public frontend.
//
// Security (same shape as create-user):
//   1. Caller must send their own logged-in token.
//   2. We verify that caller is an active OWNER (via the profiles table).
//   3. Only then do we call Gemini with the server-side key.
//
// Deploy:   supabase functions deploy insights
// Set key:  supabase secrets set GEMINI_API_KEY=your_key_from_aistudio_google_com
//           (optional) supabase secrets set GEMINI_MODEL=gemini-3.6-flash
// ----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Shape we want for Insights, so parsing is reliable.
const SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
          title: { type: 'string' },
          finding: { type: 'string' },
          action: { type: 'string' },
        },
        required: ['severity', 'title', 'finding', 'action'],
      },
    },
  },
  required: ['recommendations'],
}

function insightsPrompt(summary: unknown) {
  return [
    'You are an experienced agronomy advisor for Avrico Estates, an avocado farm in Malawi.',
    "Below is a JSON summary of the farm's current data: trees by zone and status, tasks, inventory and inspections.",
    'Give the farm owner a short, prioritised list of insights and practical recommendations.',
    'Rules:',
    '- Use ONLY the numbers in the summary. Never invent trees, zones, or figures.',
    '- Return 4 to 8 recommendations, most urgent first.',
    '- severity is one of: "critical" (act now — e.g. disease or high tree death), "warning" (deal with this week), "info" (good to know).',
    '- title: a short headline. finding: 1-2 plain sentences a non-technical owner understands. action: one concrete next step.',
    '- Be specific: name the zone codes and use the real numbers from the data. Keep advice relevant to avocado growing.',
    '',
    'FARM DATA:',
    JSON.stringify(summary),
  ].join('\n')
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

    const body = await req.json().catch(() => ({}))

    // 3a) Chat mode.
    if (Array.isArray(body?.messages)) {
      const contents = body.messages
        .filter((m: { role?: string; text?: string }) => (m?.role === 'user' || m?.role === 'model') && typeof m?.text === 'string')
        .map((m: { role: string; text: string }) => ({ role: m.role, parts: [{ text: m.text }] }))
      if (contents.length === 0) return json({ error: 'No message provided.' }, 400)

      const res = await callGemini(model, geminiKey, {
        systemInstruction: { parts: [{ text: chatSystem(body.summary ?? {}) }] },
        contents,
        generationConfig: { temperature: 0.5 },
      })
      if (res.errorResponse) return res.errorResponse
      return json({ reply: (res.text || '').trim() || "Sorry, I couldn't come up with an answer just now." })
    }

    // 3b) Insights mode.
    const summary = body?.summary
    if (!summary) return json({ error: 'No farm summary was provided.' }, 400)

    const res = await callGemini(model, geminiKey, {
      contents: [{ parts: [{ text: insightsPrompt(summary) }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: SCHEMA },
    })
    if (res.errorResponse) return res.errorResponse

    let parsed: { recommendations?: unknown } | null = null
    try { parsed = JSON.parse(res.text || '') } catch { /* fall through */ }
    const recommendations = Array.isArray(parsed?.recommendations)
      ? parsed!.recommendations
      : (Array.isArray(parsed) ? parsed : [])
    if (recommendations.length === 0) {
      return json({ error: 'The AI did not return any insights this time. Please try again.' }, 502)
    }
    return json({ recommendations, generated_at: new Date().toISOString() })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

// Call Gemini once. Returns { text } on success, or { errorResponse } to return
// directly (with friendly rate-limit handling).
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
