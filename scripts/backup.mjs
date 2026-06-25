// Nightly data backup — runs in GitHub Actions.
// Reads every table with the Supabase service-role key and uploads a single
// JSON snapshot to the PRIVATE `backups` storage bucket. Nothing is written to
// the (public) repository, so no personal data is ever exposed.

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const TABLES = [
  'profiles', 'zones', 'trees', 'tree_inspections', 'tree_treatments',
  'tree_photos', 'tree_logs', 'tree_replacements', 'tasks', 'task_submissions',
  'inventory', 'stock_movements', 'storage_locations', 'produce',
  'produce_batches', 'produce_movements', 'yield_records', 'inventory_requests',
]

const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function fetchAll(table) {
  const rows = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const res = await fetch(`${URL}/rest/v1/${table}?select=*`, {
      headers: { ...auth, 'Range-Unit': 'items', Range: `${from}-${from + page - 1}` },
    })
    if (!res.ok) {
      if (from === 0) { console.warn(`skip ${table}: HTTP ${res.status}`); return { __error: res.status } }
      break
    }
    const data = await res.json()
    rows.push(...data)
    if (data.length < page) break
  }
  return rows
}

const backup = { app: 'Avrico Estates', exported_at: new Date().toISOString(), tables: {} }
for (const t of TABLES) backup.tables[t] = await fetchAll(t)
backup.row_counts = Object.fromEntries(
  Object.entries(backup.tables).map(([t, v]) => [t, Array.isArray(v) ? v.length : 0])
)

const body = JSON.stringify(backup, null, 2)
const date = new Date().toISOString().slice(0, 10)

async function upload(path) {
  const res = await fetch(`${URL}/storage/v1/object/backups/${path}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body,
  })
  if (!res.ok) {
    console.error(`Upload ${path} failed: HTTP ${res.status} — ${await res.text()}`)
    console.error('Make sure a PRIVATE storage bucket named "backups" exists.')
    process.exit(1)
  }
  console.log(`Uploaded backups/${path}`)
}

await upload(`auto/avrico-backup-${date}.json`)
await upload('auto/latest.json')
console.log('Row counts:', backup.row_counts)
