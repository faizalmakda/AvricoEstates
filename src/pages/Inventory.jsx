import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can } from '../lib/permissions'
import { Button, PageHeader, Spinner, Modal, Field, EmptyState, Card } from '../components/ui'

export default function Inventory() {
  const { profile, user } = useAuth()
  const manage = can.manageInventory(profile)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | item

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('inventory').select('*').order('name')
    setItems(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const remove = async (item) => {
    if (!confirm(`Delete "${item.name}" from inventory?`)) return
    const { error } = await supabase.from('inventory').delete().eq('id', item.id)
    if (error) return alert(error.message)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Supplies, tools & materials"
        action={manage && <Button onClick={() => setEditing('new')}>+ Add item</Button>}
      />

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="📦" title="No inventory yet">
          {manage ? 'Add your first item.' : 'Nothing recorded yet.'}
        </EmptyState>
      ) : (
        <Card className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th><th>Category</th><th>Qty</th><th>Unit</th>
                {manage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td data-label="Item"><strong>{it.name}</strong>{it.notes && <div className="muted small">{it.notes}</div>}</td>
                  <td data-label="Category">{it.category || '—'}</td>
                  <td data-label="Qty">{it.quantity}</td>
                  <td data-label="Unit">{it.unit || '—'}</td>
                  {manage && (
                    <td className="row-actions">
                      <button className="link" onClick={() => setEditing(it)}>Edit</button>
                      <button className="link danger" onClick={() => remove(it)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && (
        <ItemModal
          item={editing === 'new' ? null : editing}
          userId={user.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function ItemModal({ item, userId, onClose, onSaved }) {
  const [form, setForm] = useState(
    item || { name: '', category: '', quantity: 0, unit: '', notes: '' }
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const payload = {
      name: form.name,
      category: form.category || null,
      quantity: Number(form.quantity) || 0,
      unit: form.unit || null,
      notes: form.notes || null,
    }
    const { error } = item
      ? await supabase.from('inventory').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', item.id)
      : await supabase.from('inventory').insert({ ...payload, created_by: userId })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal title={item ? 'Edit item' : 'Add item'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Name"><input value={form.name} onChange={set('name')} required /></Field>
        <Field label="Category"><input value={form.category || ''} onChange={set('category')} /></Field>
        <div className="row">
          <Field label="Quantity"><input type="number" step="any" value={form.quantity} onChange={set('quantity')} /></Field>
          <Field label="Unit" hint="e.g. bags, litres"><input value={form.unit || ''} onChange={set('unit')} /></Field>
        </div>
        <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}
