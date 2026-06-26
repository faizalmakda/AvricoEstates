import { supabase } from '../supabaseClient'
import { cachedSelect } from './cache'

// Build a { userId: full_name } lookup from profiles.
//
// We resolve people's names this way instead of embedding them in queries,
// because the user-id columns reference auth.users (whose schema the API does
// not expose for embedding). Reading from the public `profiles` table is both
// reliable and respects Row Level Security.
export async function fetchNameMap() {
  const { data } = await cachedSelect('names', supabase.from('profiles').select('id, full_name'))
  const map = {}
  ;(data || []).forEach((p) => { map[p.id] = p.full_name })
  return map
}

export const nameOf = (map, id) => map[id] || 'Someone'

// "Last edited by Jane · 25/06/2026" — or null if the row was never edited.
export function lastEdited(map, row) {
  if (!row?.updated_by) return null
  const when = row.updated_at ? new Date(row.updated_at).toLocaleDateString() : ''
  return `Last edited by ${nameOf(map, row.updated_by)}${when ? ` · ${when}` : ''}`
}
