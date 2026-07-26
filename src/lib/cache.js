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

// Drop cached entries so they re-fetch fresh next time (call after a mutation).
export async function cacheDelete(keys) {
  try {
    const db = await openDb()
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    ;(Array.isArray(keys) ? keys : [keys]).forEach((k) => store.delete(k))
  } catch { /* ignore */ }
}

// Like cachedSelect, but pages past Supabase's 1000-row-per-request limit to
// return EVERY matching row. `makeRangeQuery(from, to)` must return a Supabase
// select builder with a stable .order() (so paging is consistent) and .range().
// Without this, tables over 1000 rows (e.g. trees) are silently truncated and
// counts come out wrong. Returns { data, error, fromCache }.
export async function cachedSelectAll(key, makeRangeQuery) {
  const pageSize = 1000
  const rows = []
  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await makeRangeQuery(from, from + pageSize - 1)
      if (error) throw error
      const batch = data ?? []
      rows.push(...batch)
      if (batch.length < pageSize) break
    }
  } catch (e) {
    if (isOfflineError(e)) {
      const cached = await get(key)
      return { data: cached ?? null, error: null, fromCache: cached !== undefined }
    }
    return { data: null, error: e }
  }
  await put(key, rows)
  return { data: rows, error: null }
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
