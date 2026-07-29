// Offline outbox: when a field action can't reach the server (no signal), we
// stash it — including its photo — in IndexedDB and replay it automatically as
// soon as the device is back online. Used for task evidence, inspections, tree
// photos and status logs so workers can record in the field with no signal.

import { supabase } from '../supabaseClient'
import { uploadPhoto } from './upload'
import { compressImage } from './image'

const DB_NAME = 'avrico-outbox'
const STORE = 'ops'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}
const reqAsync = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })

async function putOp(op) { const db = await openDb(); return reqAsync(tx(db, 'readwrite').put(op)) }
async function delOp(id) { const db = await openDb(); return reqAsync(tx(db, 'readwrite').delete(id)) }
async function allOps() { const db = await openDb(); return reqAsync(tx(db, 'readonly').getAll()) }

// ---- observable state (for the UI sync indicator) -------------------------
let state = { pending: 0, syncing: false, failed: 0, failedReason: null }
const listeners = new Set()
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export function getStatus() { return state }
async function refresh() {
  const ops = await allOps()
  const failedOps = ops.filter((o) => o.failed)
  state = {
    ...state,
    pending: ops.filter((o) => !o.failed).length,
    failed: failedOps.length,
    failedReason: failedOps[0]?.lastError || null,
  }
  listeners.forEach((l) => l(state))
}

export function isOfflineError(e) {
  return !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(e?.message || '')
}

// Rows queued for insert into `table` that haven't synced yet (excludes failed).
// Lets the UI spot a duplicate made earlier in the same offline session, before
// it has reached the server and shown up in the cached lists.
export async function pendingInserts(table) {
  const ops = await allOps()
  return ops.filter((o) => !o.failed && o.op !== 'update' && o.table === table).map((o) => o.row)
}

// A "duplicate key" error means the record is ALREADY on the server (e.g. the
// same tree was registered on another device, or queued twice). Re-inserting can
// never succeed, so we treat it as done rather than retrying forever.
export function isDuplicateError(e) {
  return e?.code === '23505' || /duplicate key|already exists|unique constraint/i.test(e?.message || '')
}

// A foreign-key violation means the parent row (e.g. the tree a photo belongs to)
// doesn't exist — usually because its insert was dropped as a duplicate. It can
// never succeed, so it should be cleared rather than retried forever.
export function isForeignKeyError(e) {
  return e?.code === '23503' || /foreign key/i.test(e?.message || '')
}

// Guard against a single request hanging forever (a stalled upload on a weak
// connection), which would otherwise freeze the whole sync queue.
function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out while syncing')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Store an op to replay later. `op` is 'insert' (default) or 'update'.
// `photo` is { file, folder, field } using the RAW camera file — we compress it
// here so only a small blob is kept on the device.
export async function enqueue({ op = 'insert', table, row, match, patch, after, photo }) {
  let storedPhoto = null
  if (photo?.file) {
    const small = await compressImage(photo.file).catch(() => photo.file)
    storedPhoto = { file: small, folder: photo.folder, field: photo.field }
  }
  const item = { id: crypto.randomUUID(), createdAt: Date.now(), attempts: 0, op, table, row, match, patch, after, photo: storedPhoto }
  await putOp(item)
  await refresh()
  processOutbox()
  return item.id
}

// Convenience: only queue if the failure was a connectivity one.
export async function queueIfOffline(error, spec) {
  if (!isOfflineError(error)) return false
  await enqueue(spec)
  return true
}

async function executeOp(op) {
  let photoPath = null
  const hasUsablePhoto = op.photo?.file && op.photo.file.size > 0
  if (hasUsablePhoto) photoPath = await uploadPhoto(op.photo.file, op.photo.folder)

  // The photo's content was lost on the device (e.g. the browser cleared it),
  // so it can't be uploaded ("No content provided"). A pure photo record has
  // nothing left to save — treat it as done. Other records save without the photo.
  if (op.photo?.file && !hasUsablePhoto && op.op !== 'update' && op.table === 'tree_photos') {
    return
  }

  if (op.op === 'update') {
    const patch = { ...op.patch }
    if (photoPath) patch[op.photo.field] = photoPath
    const { error } = await supabase.from(op.table).update(patch).match(op.match)
    if (error) throw error
  } else {
    const row = { ...op.row }
    if (photoPath) row[op.photo.field] = photoPath
    const { error } = await supabase.from(op.table).insert(row)
    if (error) throw error
  }
  if (op.after) {
    await supabase.from(op.after.table).update(op.after.patch).match(op.after.match)
  }
}

let running = false
export async function processOutbox() {
  if (running || !navigator.onLine) return
  running = true
  state = { ...state, syncing: true }; listeners.forEach((l) => l(state))
  try {
    const ops = (await allOps()).filter((o) => !o.failed).sort((a, b) => a.createdAt - b.createdAt)
    let stalls = 0 // consecutive connection stalls
    for (const op of ops) {
      try {
        await withTimeout(executeOp(op), 30000)
        await delOp(op.id)
        stalls = 0
      } catch (e) {
        if (!navigator.onLine) break // genuinely offline — keep the rest for later
        // Errors that can never succeed on retry — clear them so they don't stick.
        if (op.op !== 'update' && (isDuplicateError(e) || isForeignKeyError(e))) {
          await delOp(op.id)
          continue
        }
        op.attempts = (op.attempts || 0) + 1
        op.lastError = e?.code ? `${e.code}: ${e.message}` : (e?.message || 'Unknown error')
        if (op.attempts >= 5) op.failed = true // give up after repeated hard failures
        await putOp(op)
        // One bad/slow item shouldn't block the rest — move on. Only back off if
        // several requests in a row are failing (the connection is likely down).
        if (isOfflineError(e) && ++stalls >= 3) break
      }
    }
  } finally {
    running = false
    state = { ...state, syncing: false }
    await refresh()
  }
}

export async function retryFailed() {
  const ops = await allOps()
  for (const o of ops) { if (o.failed) { o.failed = false; o.attempts = 0; await putOp(o) } }
  await refresh()
  processOutbox()
}

// Permanently drop the items that couldn't sync. Safe when they are duplicates
// already saved on the server; use when the failures can't be resolved.
export async function discardFailed() {
  const ops = await allOps()
  for (const o of ops) { if (o.failed) await delOp(o.id) }
  await refresh()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', processOutbox)
  refresh().then(processOutbox)
  setInterval(() => { if (state.pending > 0 && navigator.onLine) processOutbox() }, 30000)
}
