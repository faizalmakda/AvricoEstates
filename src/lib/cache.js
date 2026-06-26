// Offline read-cache. Wrap a Supabase select with cachedSelect(): on success it
// saves the result on the device; when offline it returns the last saved copy so
// lists/details still show (read-only) with no signal.

import { isOfflineError } from './outbox'

const DB_NAME = 'avrico-cache'
const STORE = 'kv'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
const reqAsync = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })

async function put(key, value) {
  try { const db = await openDb(); return await reqAsync(db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)) } catch { /* ignore */ }
}
async function get(key) {
  try { const db = await openDb(); return await reqAsync(db.transaction(STORE, 'readonly').objectStore(STORE).get(key)) } catch { return undefined }
}

// query is a Supabase builder (thenable). Returns { data, error, fromCache }.
export async function cachedSelect(key, query) {
  let res
  try { res = await query } catch (e) { res = { data: null, error: e } }
  const { data, error } = res || {}
  if (!error) {
    await put(key, data)
    return { data, error: null }
  }
  if (isOfflineError(error)) {
    const cached = await get(key)
    return { data: cached ?? null, error: null, fromCache: cached !== undefined }
  }
  return { data, error }
}
