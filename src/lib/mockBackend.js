// =============================================================================
// LOCAL DEMO BACKEND
// =============================================================================
// This is a tiny in-browser stand-in for Supabase so you can run the app on
// your own machine (npm run dev) WITHOUT creating any cloud accounts. It seeds
// realistic sample data and lets you log in instantly as any of the demo users.
//
// It only activates locally when no real Supabase keys are present (see
// supabaseClient.js). It is NEVER used in a real deployment.
//
// It mimics just the slice of the Supabase JS API that this app uses:
//   from(table).select/insert/update/delete/eq/order/limit/single
//   auth.getSession/onAuthStateChange/signInWithPassword/signOut/getUser
//   storage.from('evidence').upload/getPublicUrl
//   functions.invoke('create-user')
// =============================================================================

const STORE_KEY = 'avrico-demo-db-v1'
const SESSION_KEY = 'avrico-demo-session-v1'

// Which column points at which table — used to resolve embedded selects like
// `assignee:assigned_to(full_name)` or `trees(code)`.
const FK = {
  tasks: { assigned_to: 'profiles', created_by: 'profiles' },
  task_submissions: { submitted_by: 'profiles', task_id: 'tasks' },
  tree_logs: { logged_by: 'profiles', tree_id: 'trees' },
  produce: { tree_id: 'trees' },
  trees: { created_by: 'profiles' },
  inventory: { created_by: 'profiles' },
}

export const DEMO_ACCOUNTS = [
  { email: 'aisha@demo', label: 'Aisha Bello', role: 'owner' },
  { email: 'bilal@demo', label: 'Bilal Khan', role: 'owner' },
  { email: 'chen@demo', label: 'Chen Wei', role: 'owner' },
  { email: 'sam@demo', label: 'Sam Okoro', role: 'manager' },
]

const id = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()
const dateAgo = (n) => daysAgo(n).slice(0, 10)
const monthsAgo = (n) => {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

function seed() {
  const own1 = 'own-aisha', own2 = 'own-bilal', own3 = 'own-chen', mgr = 'mgr-sam'
  const t1 = 'tree-a014', t2 = 'tree-a022', t3 = 'tree-b003', t4 = 'tree-b011', t5 = 'tree-c008'
  return {
    profiles: [
      { id: own1, full_name: 'Aisha Bello', role: 'owner', active: true, created_at: daysAgo(120) },
      { id: own2, full_name: 'Bilal Khan', role: 'owner', active: true, created_at: daysAgo(120) },
      { id: own3, full_name: 'Chen Wei', role: 'owner', active: true, created_at: daysAgo(120) },
      { id: mgr, full_name: 'Sam Okoro', role: 'manager', active: true, created_at: daysAgo(90) },
    ],
    authUsers: [
      { id: own1, email: 'aisha@demo' },
      { id: own2, email: 'bilal@demo' },
      { id: own3, email: 'chen@demo' },
      { id: mgr, email: 'sam@demo' },
    ],
    trees: [
      { id: t1, code: 'A-014', species: 'Hass Avocado', location: 'North block, row 1', planted_on: '2021-03-12', status: 'Healthy', notes: 'Strong producer.', archived: false, created_by: own1, created_at: daysAgo(100), updated_at: daysAgo(4) },
      { id: t2, code: 'A-022', species: 'Hass Avocado', location: 'North block, row 3', planted_on: '2021-03-12', status: 'Needs Inspection', notes: '', archived: false, created_by: own1, created_at: daysAgo(100), updated_at: daysAgo(2) },
      { id: t3, code: 'B-003', species: 'Mango (Kent)', location: 'East block, row 1', planted_on: '2019-06-01', status: 'Diseased', notes: 'Watch for anthracnose.', archived: false, created_by: own2, created_at: daysAgo(98), updated_at: daysAgo(1) },
      { id: t4, code: 'B-011', species: 'Mango (Kent)', location: 'East block, row 2', planted_on: '2019-06-01', status: 'Healthy', notes: '', archived: false, created_by: own2, created_at: daysAgo(98), updated_at: daysAgo(20) },
      { id: t5, code: 'C-008', species: 'Lime', location: 'South block', planted_on: '2022-01-20', status: 'Weak', notes: 'Recently transplanted.', archived: false, created_by: own3, created_at: daysAgo(60), updated_at: daysAgo(6) },
    ],
    tree_logs: [
      { id: id('log'), tree_id: t3, status: 'Diseased', note: 'Black spots on several leaves, likely fungal.', photo_path: null, logged_by: mgr, created_at: daysAgo(1) },
      { id: id('log'), tree_id: t2, status: 'Needs Inspection', note: 'Some yellowing — please check.', photo_path: null, logged_by: mgr, created_at: daysAgo(2) },
      { id: id('log'), tree_id: t5, status: 'Weak', note: 'Slow growth after transplant.', photo_path: null, logged_by: own3, created_at: daysAgo(6) },
      { id: id('log'), tree_id: t1, status: 'Healthy', note: 'Good fruit set this season.', photo_path: null, logged_by: mgr, created_at: daysAgo(4) },
    ],
    tasks: [
      { id: 'task-1', title: 'Inspect diseased mango B-003', instructions: 'Check leaves and fruit on B-003 for anthracnose. Photograph affected areas and log the tree status.', assigned_to: mgr, priority: 'High', due_date: dateAgo(-2), status: 'Open', created_by: own2, created_at: daysAgo(3), updated_at: daysAgo(3) },
      { id: 'task-2', title: 'Water South block limes', instructions: 'Deep-water all limes in the South block. Note any that look weak.', assigned_to: mgr, priority: 'Normal', due_date: dateAgo(-1), status: 'Open', created_by: own1, created_at: daysAgo(2), updated_at: daysAgo(2) },
      { id: 'task-3', title: 'Clear irrigation line, North block', instructions: 'The drip line in North row 3 is blocked. Clear and test.', assigned_to: mgr, priority: 'Normal', due_date: dateAgo(2), status: 'Completed', created_by: own1, created_at: daysAgo(8), updated_at: daysAgo(5) },
      { id: 'task-4', title: 'Order fertiliser for next quarter', instructions: 'Compare suppliers and place order.', assigned_to: own3, priority: 'Low', due_date: dateAgo(-14), status: 'Open', created_by: own3, created_at: daysAgo(5), updated_at: daysAgo(5) },
    ],
    task_submissions: [
      { id: id('sub'), task_id: 'task-3', status: 'Completed', note: 'Cleared the blockage and tested — water flowing well now.', photo_path: null, submitted_by: mgr, created_at: daysAgo(5) },
    ],
    inventory: [
      { id: id('inv'), name: 'NPK Fertiliser 15-15-15', category: 'Fertiliser', quantity: 12, unit: 'bags', notes: '25kg bags', created_by: own1, created_at: daysAgo(40), updated_at: daysAgo(40) },
      { id: id('inv'), name: 'Copper fungicide', category: 'Chemicals', quantity: 4, unit: 'litres', notes: 'For fungal disease', created_by: own2, created_at: daysAgo(30), updated_at: daysAgo(30) },
      { id: id('inv'), name: 'Pruning shears', category: 'Tools', quantity: 6, unit: 'units', notes: '', created_by: own1, created_at: daysAgo(50), updated_at: daysAgo(50) },
      { id: id('inv'), name: 'Drip line (roll)', category: 'Irrigation', quantity: 3, unit: 'rolls', notes: '100m rolls', created_by: own3, created_at: daysAgo(25), updated_at: daysAgo(25) },
    ],
    produce: [
      { id: id('prd'), tree_id: t1, crop: 'Avocado', quantity: 85, unit: 'kg', harvested_on: monthsAgo(0), notes: '', created_by: own1, created_at: monthsAgo(0) },
      { id: id('prd'), tree_id: t4, crop: 'Mango', quantity: 120, unit: 'kg', harvested_on: monthsAgo(1), notes: 'Good season', created_by: own2, created_at: monthsAgo(1) },
      { id: id('prd'), tree_id: t1, crop: 'Avocado', quantity: 60, unit: 'kg', harvested_on: monthsAgo(2), notes: '', created_by: own1, created_at: monthsAgo(2) },
      { id: id('prd'), tree_id: t5, crop: 'Lime', quantity: 30, unit: 'kg', harvested_on: monthsAgo(3), notes: '', created_by: own3, created_at: monthsAgo(3) },
    ],
  }
}

function loadDb() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  const fresh = seed()
  localStorage.setItem(STORE_KEY, JSON.stringify(fresh))
  return fresh
}

export function resetDemo() {
  localStorage.removeItem(STORE_KEY)
  localStorage.removeItem(SESSION_KEY)
}

// ---- select string parsing -------------------------------------------------
function splitTop(str) {
  const out = []
  let depth = 0, cur = ''
  for (const ch of str) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' }
    else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

function parseSelect(table, sel) {
  const embeds = []
  splitTop(sel || '*').forEach((tokenRaw) => {
    const token = tokenRaw.trim()
    if (!token.includes('(')) return
    const open = token.indexOf('(')
    const inner = token.slice(open + 1, token.lastIndexOf(')'))
    let head = token.slice(0, open)
    let alias, rel
    if (head.includes(':')) [alias, rel] = head.split(':').map((s) => s.trim())
    else { rel = head.trim(); alias = rel }
    const map = FK[table] || {}
    let fkCol, target
    if (map[rel]) { fkCol = rel; target = map[rel] }
    else {
      // rel is a table name; find the column that points to it
      fkCol = Object.keys(map).find((k) => map[k] === rel)
      target = rel
    }
    embeds.push({ alias, fkCol, target, cols: inner.split(',').map((s) => s.trim()) })
  })
  return embeds
}

function applyEmbeds(db, table, rows, sel) {
  const embeds = parseSelect(table, sel)
  if (!embeds.length) return rows
  return rows.map((row) => {
    const copy = { ...row }
    embeds.forEach((e) => {
      const ref = (db[e.target] || []).find((r) => r.id === row[e.fkCol])
      if (!ref) { copy[e.alias] = null; return }
      if (e.cols.includes('*')) copy[e.alias] = { ...ref }
      else {
        const picked = {}
        e.cols.forEach((c) => (picked[c] = ref[c]))
        copy[e.alias] = picked
      }
    })
    return copy
  })
}

// =============================================================================
export function createMockClient() {
  let db = loadDb()
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(db))
  const listeners = new Set()

  // ---- session ----
  const readSession = () => {
    try {
      const sid = localStorage.getItem(SESSION_KEY)
      if (!sid) return null
      const au = db.authUsers.find((u) => u.id === sid)
      return au ? { user: { id: au.id, email: au.email } } : null
    } catch { return null }
  }
  let session = readSession()
  const profileFor = (uid) => db.profiles.find((p) => p.id === uid)
  const emit = () => listeners.forEach((cb) => cb('SIGNED_IN', session))

  // RLS-style row filtering so the manager experience matches production.
  const rlsFilter = (table, rows) => {
    const me = session?.user
    if (!me) return rows
    const prof = profileFor(me.id)
    if (!prof || prof.role === 'owner') return rows
    if (table === 'tasks') return rows.filter((r) => r.assigned_to === me.id)
    if (table === 'task_submissions') return rows.filter((r) => r.submitted_by === me.id)
    return rows
  }

  function makeQuery(table) {
    const state = { table, op: 'select', sel: '*', filters: [], order: null, limitN: null, single: false, payload: null }

    const exec = () => {
      try {
        if (state.op === 'insert') {
          const rows = Array.isArray(state.payload) ? state.payload : [state.payload]
          rows.forEach((r) => {
            const row = { id: r.id || id(table.slice(0, 3)), created_at: r.created_at || new Date().toISOString(), ...r }
            if (table === 'tasks' && !row.status) row.status = 'Open'
            db[table].push(row)
            // Emulate the DB trigger: a submission updates its parent task.
            if (table === 'task_submissions') {
              const t = db.tasks.find((x) => x.id === row.task_id)
              if (t) { t.status = row.status; t.updated_at = new Date().toISOString() }
            }
          })
          save()
          return { data: null, error: null }
        }
        if (state.op === 'update') {
          db[table].forEach((row) => {
            if (state.filters.every((f) => row[f.col] === f.val)) Object.assign(row, state.payload)
          })
          save()
          return { data: null, error: null }
        }
        if (state.op === 'delete') {
          db[table] = db[table].filter((row) => !state.filters.every((f) => row[f.col] === f.val))
          save()
          return { data: null, error: null }
        }
        // select
        let rows = [...(db[table] || [])]
        state.filters.forEach((f) => { rows = rows.filter((r) => r[f.col] === f.val) })
        rows = rlsFilter(table, rows)
        if (state.order) {
          const { col, ascending } = state.order
          rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (ascending ? 1 : -1))
        }
        if (state.limitN != null) rows = rows.slice(0, state.limitN)
        rows = applyEmbeds(db, table, rows, state.sel)
        if (state.single) return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'Row not found' } }
        return { data: rows, error: null }
      } catch (e) {
        return { data: null, error: { message: String(e?.message ?? e) } }
      }
    }

    const builder = {
      select(sel = '*') { state.op = 'select'; state.sel = sel; return builder },
      insert(payload) { state.op = 'insert'; state.payload = payload; return builder },
      update(payload) { state.op = 'update'; state.payload = payload; return builder },
      delete() { state.op = 'delete'; return builder },
      eq(col, val) { state.filters.push({ col, val }); return builder },
      order(col, opts = {}) { state.order = { col, ascending: opts.ascending !== false }; return builder },
      limit(n) { state.limitN = n; return builder },
      single() { state.single = true; return Promise.resolve(exec()) },
      maybeSingle() {
        state.single = true
        const r = exec()
        return Promise.resolve({ data: r.data ?? null, error: null })
      },
      then(resolve, reject) { return Promise.resolve(exec()).then(resolve, reject) },
    }
    return builder
  }

  const photoUrls = {}

  return {
    __isDemo: true,
    from: (table) => makeQuery(table),
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
      onAuthStateChange(cb) {
        listeners.add(cb)
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
      },
      async signInWithPassword({ email }) {
        const au = db.authUsers.find((u) => u.email === email.trim().toLowerCase())
        if (!au) return { data: null, error: { message: 'No demo account with that email.' } }
        session = { user: { id: au.id, email: au.email } }
        localStorage.setItem(SESSION_KEY, au.id)
        emit()
        return { data: { session }, error: null }
      },
      async signOut() {
        session = null
        localStorage.removeItem(SESSION_KEY)
        emit()
        return { error: null }
      },
    },
    storage: {
      from: () => ({
        async upload(path, file) {
          try { photoUrls[path] = URL.createObjectURL(file) } catch {}
          return { data: { path }, error: null }
        },
        getPublicUrl: (path) => ({ data: { publicUrl: photoUrls[path] || '' } }),
      }),
    },
    functions: {
      async invoke(name, { body } = {}) {
        if (name === 'create-user') {
          const newId = id('user')
          db.authUsers.push({ id: newId, email: (body.email || '').toLowerCase() })
          db.profiles.push({
            id: newId,
            full_name: body.full_name || body.email,
            role: body.role === 'owner' ? 'owner' : 'manager',
            active: true,
            created_at: new Date().toISOString(),
          })
          save()
          return { data: { ok: true, user_id: newId }, error: null }
        }
        return { data: null, error: { message: `Unknown function: ${name}` } }
      },
    },
  }
}
