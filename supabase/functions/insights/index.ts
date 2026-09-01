// Supabase Edge Function: insights
// ----------------------------------------------------------------------------
// Owner-only. Takes a compact JSON summary of the farm's data, asks Google
// Gemini (free tier) for prioritised recommendations, and returns them as JSON.
// The Gemini API key stays here on the server — never in the public frontend.
//
// Security (same shape as create-user):
//   1. The caller must send their own logged-in token.
//   2. We verify that caller is an active OWNER (via the profiles table).
//   3. Only then do we call Gemini with the server-side key.
//
// Deploy:   supabase functions deploy insights
// Set key:  supabase secrets set GEMINI_API_KEY=your_key_from_aistudio_google_com
//           (optional) supabase secrets set GEMINI_MODEL=gemini-2.0-flash
// ----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// The exact shape we want Gemini to return, so parsing is reliable.
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

function buildPrompt(summary: unknown) {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'

    if (!geminiKey) {
      return json({ error: 'AI is not set up yet. Add the GEMINI_API_KEY secret in Supabase to enable insights.' }, 400)
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
      return json({ error: 'Only owners can generate insights.' }, 403)
    }

    // 3) Ask Gemini.
    const body = await req.json().catch(() => ({}))
    const summary = body?.summary
    if (!summary) return json({ error: 'No farm summary was provided.' }, 400)

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(summary) }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: SCHEMA },
        }),
      },
    )

    if (!geminiRes.ok) {
      const detail = (await geminiRes.text()).slice(0, 400)
      return json({ error: `The AI service returned an error (${geminiRes.status}). ${detail}` }, 502)
    }

    const data = await geminiRes.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch { /* fall through */ }
    const recommendations = Array.isArray(parsed?.recommendations)
      ? parsed.recommendations
      : (Array.isArray(parsed) ? parsed : [])

    if (recommendations.length === 0) {
      return json({ error: 'The AI did not return any insights this time. Please try again.' }, 502)
    }

    return json({ recommendations, generated_at: new Date().toISOString() })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
