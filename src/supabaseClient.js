import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Helpful, friendly error if the app was built without its connection details.
export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

// Public URL for a photo stored in the 'evidence' bucket.
export function evidenceUrl(path) {
  if (!path || !supabase) return null
  return supabase.storage.from('evidence').getPublicUrl(path).data.publicUrl
}
