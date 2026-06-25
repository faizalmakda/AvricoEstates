import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can } from '../lib/permissions'
import { fetchNameMap, nameOf } from '../lib/people'
import { Button, PageHeader, Spinner, Modal, Field, EmptyState, Card, Badge, Banner } from '../components/ui'

const CATEGORIES = ['Fertiliser', 'Chemicals', 'Tools', 'Irrigation parts', 'Bags', 'Crates', 'Fuel', 'Other']

// current stock = baseline quantity + signed movements (transfer doesn't change total)
function currentStock(item, movements) {
  const delta = movements
    .filter((m) => m.item_id === item.id)
    .reduce((s, m) => {
      if (m.movement_type === 'in' || m.movement_type === 'adjust') return s + Number(m.quantity || 0)
      if (m.movement_type === 'out') return s - Number(m.quantity || 0)
      return s
    }, 0)
  return Number(item.quantity || 0) + delta
}

export default function Inventory() {
  const { profile, user } = useAuth()
  const manage = can.manageInventory(profile)
  const canMove = can.recordStockUsage(profile)
  const [items, setItems] = useState([])
  const [movements, setMovements] = useState([])
  const [zones, setZones] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [editing, setEditing] = useState(null)     // 'new' | item
  const [moving, setMoving] = useState(null)        // { item, type }
  const [history, setHistory] = useState(null)      // item

  const load = async () => {
    setLoading(true)
    const [{ data: it }, { data: mv }, { data: z }, nameMap] = await Promise.all([
      supabase.from('inventory').select('*').order('name'),
      supabase.from('stock_movements').select('*, zone:zone_id(code)').order('created_at', { ascending: false }),
      supabase.from('zones').select('id,code').order('code'),
      fetchNameMap(),
    ])
    setItems(it ?? [])
    setMovements(mv ?? [])
    setZones(z ?? [])
    setNames(nameMap)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const rows = useMemo(() => {
    return items
      .map((it) => ({ ...it, stock: currentStock(it, movements) }))
      .filter((it) => {
        if (cat && it.category !== cat) return false
        if (q && !`${it.name} ${it.category || ''} ${it.location || ''}`.toLowerCase().includes(q.toLowerCase())) return false
        if (lowOnly && !(it.min_stock != null && it.stock <= it.min_stock)) return false
        return true
      })
  }, [items, movements, q, cat, lowOnly])

  const lowItems = items
    .map((it) => ({ ...it, stock: currentStock(it, movements) }))
    .filter((it) => it.min_stock != null && Number(it.min_stock) > 0 && it.stock <= it.min_stock)

  const remove = async (item) => {
    if (!confirm(`Delete "${item.name}"? Its stock history will also be removed.`)) return
    const { error } = await supabase.from('inventory').delete().eq('id', item.id)
    if (error) return alert(error.message)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Inventory & Warehouse"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'}`}
        action={manage && <Button onClick={() => setEditing('new')}>+ Add item</Button>}
      />

      {!loading && zones.length === 0 && items.length === 0 && (
        <Banner kind="info">
          ⚙️ If items don't appear, run <code>supabase/schema_v2.sql</code> in Supabase to enable
          warehouse features.
        </Banner>
      )}

      {lowItems.length > 0 && (
        <Banner kind="error">
          ⚠️ <strong>Low stock:</strong> {lowItems.map((i) => i.name).join(', ')}
        </Banner>
      )}

      <div className="toolbar">
        <input className="search" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
        </label>
      </div>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState icon="📦" title="No items">
          {manage ? 'Add your first inventory item.' : 'Nothing recorded yet.'}
        </EmptyState>
      ) : (
        <Card className="table-card">
          <table className="table">
            <thead>
              <tr><th>Item</th><th>In stock</th><th>Min</th><th>Location</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const low = it.min_stock != null && Number(it.min_stock) > 0 && it.stock <= it.min_stock
                return (
                  <tr key={it.id}>
                    <td data-label="Item">
                      <strong>{it.name}</strong>
                      {it.category && <div className="muted small">{it.category}</div>}
                    </td>
                    <td data-label="In stock">
                      <span className="stock-num">{it.stock}</span> <span className="muted small">{it.unit || ''}</span>
                      {low && <Badge color="#b5392b">Low</Badge>}
                    </td>
                    <td data-label="Min">{it.min_stock ?? '—'}</td>
                    <td data-label="Location">{it.location || '—'}</td>
                    <td className="row-actions">
                      {canMove && <button className="link" onClick={() => setMoving({ item: it, type: 'in' })}>Add</button>}
                      {canMove && <button className="link" onClick={() => setMoving({ item: it, type: 'out' })}>Use</button>}
                      {canMove && <button className="link" onClick={() => setMoving({ item: it, type: 'transfer' })}>Transfer</button>}
                      <button className="link" onClick={() => setHistory(it)}>History</button>
                      {manage && <button className="link" onClick={() => setEditing(it)}>Edit</button>}
                      {manage && <button className="link danger" onClick={() => remove(it)}>Delete</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {editing && (
        <ItemModal item={editing === 'new' ? null : editing} userId={user.id}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
      {moving && (
        <MovementModal move={moving} zones={zones} userId={user.id}
          currentStock={currentStock(moving.item, movements)}
          onClose={() => setMoving(null)} onSaved={() => { setMoving(null); load() }} />
      )}
      {history && (
        <HistoryModal item={history} names={names} movements={movements.filter((m) => m.item_id === history.id)}
          onClose={() => setHistory(null)} />
      )}
    </div>
  )
}

const MOVE_LABEL = { in: 'Add stock', out: 'Use stock', transfer: 'Transfer stock' }

function MovementModal({ move, zones, userId, currentStock, onClose, onSaved }) {
  const { item, type } = move
  const [f, setF] = useState({ quantity: '', reason: '', zone_id: '', from_location: item.location || '', to_location: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    const qty = Number(f.quantity)
    if (!qty || qty <= 0) return setError('Enter a quantity greater than 0.')
    if (type === 'out' && qty > currentStock && !confirm('This is more than the current stock. Record anyway?')) return
    setBusy(true); setError(null)
    const { error } = await supabase.from('stock_movements').insert({
      item_id: item.id,
      movement_type: type,
      quantity: qty,
      unit: item.unit || null,
      reason: f.reason || null,
      zone_id: type === 'out' ? (f.zone_id || null) : null,
      from_location: type === 'transfer' ? (f.from_location || null) : null,
      to_location: type === 'transfer' ? (f.to_location || null) : null,
      performed_by: userId,
    })
    // Keep the item's "main location" in step after a transfer.
    if (!error && type === 'transfer' && f.to_location) {
      await supabase.from('inventory').update({ location: f.to_location }).eq('id', item.id)
    }
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal title={`${MOVE_LABEL[type]} — ${item.name}`} onClose={onClose}>
      <p className="muted small">Currently in stock: <strong>{currentStock} {item.unit || ''}</strong></p>
      <form onSubmit={submit}>
        <Field label={`Quantity${item.unit ? ` (${item.unit})` : ''}`}>
          <input type="number" step="any" min="0" value={f.quantity} onChange={set('quantity')} autoFocus required />
        </Field>
        {type === 'out' && (
          <Field label="Used for which zone/block">
            <select value={f.zone_id} onChange={set('zone_id')}>
              <option value="">— Not zone-specific —</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}
            </select>
          </Field>
        )}
        {type === 'transfer' && (
          <div className="row">
            <Field label="From"><input value={f.from_location} onChange={set('from_location')} /></Field>
            <Field label="To"><input value={f.to_location} onChange={set('to_location')} required /></Field>
          </div>
        )}
        <Field label={type === 'out' ? 'Reason (why used)' : 'Note'}>
          <input value={f.reason} onChange={set('reason')} placeholder={type === 'out' ? 'e.g. fertilising young trees' : ''} />
        </Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : MOVE_LABEL[type]}</Button>
        </div>
      </form>
    </Modal>
  )
}

function HistoryModal({ item, movements, names, onClose }) {
  const verb = { in: 'Added', out: 'Used', transfer: 'Transferred', adjust: 'Adjusted' }
  return (
    <Modal title={`History — ${item.name}`} onClose={onClose}>
      {movements.length === 0 ? (
        <p className="muted">No stock movements yet.</p>
      ) : (
        <ul className="timeline">
          {movements.map((m) => (
            <li key={m.id}>
              <div className="timeline-dot" style={{ background: m.movement_type === 'out' ? '#b5392b' : '#4d7a32' }} />
              <div className="timeline-body">
                <div className="timeline-head">
                  <strong>{verb[m.movement_type]} {m.quantity} {m.unit || ''}</strong>
                  <span className="muted small">{nameOf(names, m.performed_by)} · {new Date(m.created_at).toLocaleDateString()}</span>
                </div>
                <p className="muted small">
                  {[m.zone?.code && `Zone ${m.zone.code}`,
                    m.from_location && `${m.from_location} → ${m.to_location}`,
                    m.reason].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function ItemModal({ item, userId, onClose, onSaved }) {
  const [form, setForm] = useState(
    item || { name: '', category: '', unit: '', quantity: 0, min_stock: 0, location: '', notes: '' }
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError(null)
    const base = {
      name: form.name,
      category: form.category || null,
      unit: form.unit || null,
      min_stock: Number(form.min_stock) || 0,
      location: form.location || null,
      notes: form.notes || null,
    }
    let error
    if (item) {
      ;({ error } = await supabase.from('inventory').update({ ...base, updated_at: new Date().toISOString() }).eq('id', item.id))
    } else {
      ;({ error } = await supabase.from('inventory').insert({ ...base, quantity: Number(form.quantity) || 0, created_by: userId }))
    }
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal title={item ? 'Edit item' : 'Add item'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Name"><input value={form.name} onChange={set('name')} required /></Field>
        <div className="row">
          <Field label="Category">
            <input list="cat-list" value={form.category || ''} onChange={set('category')} />
            <datalist id="cat-list">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Unit" hint="e.g. bags, litres, kg"><input value={form.unit || ''} onChange={set('unit')} /></Field>
        </div>
        <div className="row">
          {!item && (
            <Field label="Starting quantity"><input type="number" step="any" value={form.quantity} onChange={set('quantity')} /></Field>
          )}
          <Field label="Low-stock alert at" hint="Warn when stock ≤ this"><input type="number" step="any" value={form.min_stock} onChange={set('min_stock')} /></Field>
        </div>
        <Field label="Location"><input value={form.location || ''} onChange={set('location')} placeholder="e.g. Main shed" /></Field>
        <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
        {item && <p className="muted small">To change the stock count, close this and use <strong>Add</strong> / <strong>Use</strong> / <strong>Transfer</strong>.</p>}
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}
