import { supabase } from '../supabaseClient'
import { compressImage } from './image'

// Uploads a photo File to the 'evidence' bucket and returns its storage path.
// Photos are compressed to a small JPEG first to save storage. We never
// overwrite: every upload gets a unique, time-stamped name.
export async function uploadPhoto(file, folder = 'misc') {
  if (!file || file.size === 0) return null // nothing to upload (e.g. lost/empty photo)
  const small = await compressImage(file).catch(() => file)
  const ext = (small.name.split('.').pop() || 'jpg').toLowerCase()
  const safe = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('evidence')
    .upload(safe, small, { cacheControl: '3600', upsert: false })
  if (error) throw error
  return safe
}
