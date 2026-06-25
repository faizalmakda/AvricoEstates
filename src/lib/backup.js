import { supabase } from '../supabaseClient'

// Every table that holds your data. Photos themselves live in Storage; this
// captures all the records (including the links to those photos).
const TABLES = [
  'profiles', 'zones', 'trees', 'tree_inspections', 'tree_treatments',
  'tree_photos', 'tree_logs', 'tree_replacements', 'tasks', 'task_submissions',
  'inventory', 'stock_movements', 'storage_locations', 'produce',
  'produce_batches', 'produce_movements', 'yield_records', 'inventory_requests',
]

// Fetch every row of a table, paging past the API's 1000-row limit.
async function fetchAll(table) {
  const rows = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + page - 1)
    if (error) {
      // A table that doesn't exist yet (migration not run) shouldn't fail the whole backup.
      if (from === 0) return { __error: error.message }
      break
    }
    rows.push(...(data ?? []))
    if (!data || data.length < page) break
  }
  return rows
}

// Build a single JSON backup of everything and trigger a download.
export async function downloadBackup() {
  const backup = { app: 'Avrico Estates', exported_at: new Date().toISOString(), tables: {} }
  for (const t of TABLES) backup.tables[t] = await fetchAll(t)

  const counts = Object.fromEntries(
    Object.entries(backup.tables).map(([t, v]) => [t, Array.isArray(v) ? v.length : 0])
  )
  backup.row_counts = counts

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `avrico-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  return counts
}
