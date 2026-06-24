import { createClient } from '@supabase/supabase-js'
import { createMockClient } from './lib/mockBackend'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasRealBackend = Boolean(url && anonKey)

// Demo mode: when running locally (npm run dev) without Supabase keys, use an
// in-browser mock backend with sample data so you can try the app immediately.
// In a real deployment (production build), missing keys instead show the setup
// screen — demo data never leaks into a live site.
export const isDemo = !hasRealBackend && import.meta.env.DEV

// The app should proceed (show login) when it has either a real backend or demo.
export const isConfigured = hasRealBackend || isDemo

export const supabase = hasRealBackend
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : isDemo
    ? createMockClient()
    : null

// Public URL for a photo stored in the 'evidence' bucket.
export function evidenceUrl(path) {
  if (!path || !supabase) return null
  return supabase.storage.from('evidence').getPublicUrl(path).data.publicUrl
}
