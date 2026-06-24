import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can } from '../lib/permissions'
import { Button, PageHeader, Spinner, Modal, Field, EmptyState, Card } from '../components/ui'

export default function Produce() {
  const { profile, user } = useAuth()
  const manage = can.manageProduce(profile)
  const [rows, setRows] = useState([])
  const [trees, setTrees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data }, { data: t }] = await Promise.all([
      supabase.from('produce').select('*, tree:tree_id(code)').order('harvested_on', { ascending: false }),
      supabase.from('trees').select('id,code').order('code'),
    ])
    setRows(data ?? [])
    setTrees(t ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const remove = async (row) => {
    if (!confirm('Delete this yield record?')) return
    const { error } = await supabase.from('produce').delete().eq('id', row.id)
    if (error) return alert(error.message)
    load()
  }

  const total = rows.reduce((s, r) => s + Number(r.quantity || 0), 0)

  return (
    <div>
      <PageHeader
        title="Yield / Produce"
        subtitle={`Total recorded: ${total}`}
        action={manage && <Button onClick={() => setShowNew(true)}>+ Record harvest</Button>}
      />

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState icon="🧺" title="No harvests recorded">
          {manage ? 'Record your first harvest.' : 'Nothing recorded yet.'}
        </EmptyState>
      ) : (
        <Card className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Crop</th><th>Tree</th><th>Qty</th><th>Unit</th>
                {manage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="Date">{r.harvested_on}</td>
                  <td data-label="Crop"><strong>{r.crop}</strong>{r.notes && <div className="muted small">{r.notes}</div>}</td>
                  <td data-label="Tree">{r.tree?.code || '—'}</td>
                  <td data-label="Qty">{r.quantity}</td>
                  <td data-label="Unit">{r.unit || '—'}</td>
                  {manage && (
                    <td className="row-actions">
                      <button className="link danger" onClick={() => remove(r)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showNew && (
        <HarvestModal
          trees={trees}
          userId={user.id}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load() }}
        />
      )}
    </div>
  )
}

function HarvestModal({ trees, userId, onClose, onSaved }) {
  const [form, setForm] = useState({
    crop: '', tree_id: '', quantity: 0, unit: 'kg',
    harvested_on: new Date().toISOString().slice(0, 10), notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.from('produce').insert({
      crop: form.crop,
      tree_id: form.tree_id || null,
      quantity: Number(form.quantity) || 0,
      unit: form.unit || null,
      harvested_on: form.harvested_on,
      notes: form.notes || null,
      created_by: userId,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal title="Record harvest" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Crop"><input value={form.crop} onChange={set('crop')} required /></Field>
        <Field label="From tree (optional)">
          <select value={form.tree_id} onChange={set('tree_id')}>
            <option value="">— Not tree-specific —</option>
            {trees.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
          </select>
        </Field>
        <div className="row">
          <Field label="Quantity"><input type="number" step="any" value={form.quantity} onChange={set('quantity')} /></Field>
          <Field label="Unit"><input value={form.unit} onChange={set('unit')} /></Field>
        </div>
        <Field label="Harvest date"><input type="date" value={form.harvested_on} onChange={set('harvested_on')} /></Field>
        <Field label="Notes"><textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}
