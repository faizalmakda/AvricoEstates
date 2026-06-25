// Supabase Edge Function: create-user
// ----------------------------------------------------------------------------
// Lets an OWNER create a new login (farm manager or another owner) from inside
// the app, without leaking the powerful service-role key into the browser.
//
// How security works here:
//   1. The caller must send their own logged-in token.
//   2. We verify that caller is an active OWNER (via the profiles table).
//   3. Only then do we use the service-role key to create the auth user.
//
// Deploy with the Supabase CLI:
//   supabase functions deploy create-user
// (Set the env vars in the dashboard: SUPABASE_URL, SUPABASE_ANON_KEY,
//  SUPABASE_SERVICE_ROLE_KEY — the first two are usually injected for you.)
// ----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''
    // Client scoped to the caller, used only to check WHO they are.
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: me } = await caller.auth.getUser()
    if (!me?.user) {
      return json({ error: 'Not signed in.' }, 401)
    }

    const { data: profile } = await caller
      .from('profiles')
      .select('role, active')
      .eq('id', me.user.id)
      .single()

    if (!profile || profile.role !== 'owner' || !profile.active) {
      return json({ error: 'Only owners can add users.' }, 403)
    }

    const body = await req.json()
    const email: string = (body.email ?? '').trim().toLowerCase()
    const password: string = body.password ?? ''
    const fullName: string = (body.full_name ?? '').trim()
    const role: string = ['owner', 'manager', 'worker', 'viewer'].includes(body.role) ? body.role : 'manager'

    if (!email || password.length < 6) {
      return json({ error: 'Email and a password of at least 6 characters are required.' }, 400)
    }

    // Admin client (service role) — only reached after the owner check above.
    const admin = createClient(url, service)
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split('@')[0], role },
    })
    if (error) return json({ error: error.message }, 400)

    // Make sure the profile reflects the requested role (the signup trigger
    // defaults to 'manager').
    await admin
      .from('profiles')
      .upsert({ id: created.user.id, full_name: fullName || email.split('@')[0], role })

    return json({ ok: true, user_id: created.user.id })
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
