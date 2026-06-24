import { supabase } from '../supabaseClient'

// Uploads a photo File to the 'evidence' bucket and returns its storage path.
// We never overwrite: every upload gets a unique, time-stamped name so old
// evidence is always preserved.
export async function uploadPhoto(file, folder = 'misc') {
  if (!file) return null
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const safe = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('evidence')
    .upload(safe, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  return safe
}
