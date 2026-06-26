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
let state = { pending: 0, syncing: false, failed: 0 }
const listeners = new Set()
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export function getStatus() { return state }
async function refresh() {
  const ops = await allOps()
  state = { ...state, pending: ops.filter((o) => !o.failed).length, failed: ops.filter((o) => o.failed).length }
  listeners.forEach((l) => l(state))
}

export function isOfflineError(e) {
  return !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(e?.message || '')
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
  if (op.photo?.file) photoPath = await uploadPhoto(op.photo.file, op.photo.folder)

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
    for (const op of ops) {
      try {
        await executeOp(op)
        await delOp(op.id)
      } catch (e) {
        if (isOfflineError(e)) break // lost signal again — keep the rest for later
        op.attempts = (op.attempts || 0) + 1
        if (op.attempts >= 5) op.failed = true // give up after repeated hard failures
        await putOp(op)
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

if (typeof window !== 'undefined') {
  window.addEventListener('online', processOutbox)
  refresh().then(processOutbox)
  setInterval(() => { if (state.pending > 0 && navigator.onLine) processOutbox() }, 30000)
}
