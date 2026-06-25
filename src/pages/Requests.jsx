import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can } from '../lib/permissions'
import { fetchNameMap, nameOf } from '../lib/people'
import { Button, PageHeader, Spinner, Modal, Field, EmptyState, Card, Badge, Banner } from '../components/ui'

const STATUS_COLOR = {
  requested: '#f9a825', approved: '#1565c0', purchased: '#2e7d32',
  rejected: '#b5392b', cancelled: '#6f7a6a',
}

export default function Requests() {
  const { profile, user } = useAuth()
  const [reqs, setReqs] = useState([])
  const [items, setItems] = useState([])
  const [zones, setZones] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [purchasing, setPurchasing] = useState(null)
  const [needsMigration, setNeedsMigration] = useState(false)

  const load = async () => {
    setLoading(true)
    const [r, it, z, nm] = await Promise.all([
      supabase.from('inventory_requests').select('*, zone:zone_id(code)').order('created_at', { ascending: false }),
      supabase.from('inventory').select('id,name,unit').order('name'),
      supabase.from('zones').select('id,code').order('code'),
      fetchNameMap(),
    ])
    setNeedsMigration(Boolean(r.error))
    setReqs(r.data ?? [])
    setItems(it.data ?? [])
    setZones(z.data ?? [])
    setNames(nm)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setStatus = async (req, patch) => {
    const { error } = await supabase.from('inventory_requests').update(patch).eq('id', req.id)
    if (error) return alert(error.message)
    load()
  }
  const approve = (req) => setStatus(req, { status: 'approved', approved_by: user.id, decided_at: new Date().toISOString() })
  const reject = (req) => {
    const reason = prompt('Reason for rejecting (optional):') ?? ''
    setStatus(req, { status: 'rejected', approved_by: user.id, decided_at: new Date().toISOString(), notes: reason || null })
  }
  const cancel = (req) => { if (confirm('Cancel this request?')) setStatus(req, { status: 'cancelled' }) }

  const awaiting = reqs.filter((r) => r.status === 'requested')
  const toBuy = reqs.filter((r) => r.status === 'approved')
  const history = reqs.filter((r) => ['purchased', 'rejected', 'cancelled'].includes(r.status))

  const Row = ({ r, actions }) => (
    <div className="req-row">
      <div className="req-main">
        <div className="req-title">{r.quantity} {r.unit || ''} · {r.item_name}</div>
        <div className="muted small">
          {`by ${nameOf(names, r.requested_by)}`}
          {r.zone?.code ? ` · Zone ${r.zone.code}` : ''}
          {r.reason ? ` · ${r.reason}` : ''}
        </div>
        {r.status === 'purchased' && (
          <div className="muted small">Purchased {r.purchased_quantity} {r.unit || ''} by {nameOf(names, r.purchased_by)}</div>
        )}
        {r.status === 'rejected' && r.notes && <div className="muted small">Rejected: {r.notes}</div>}
      </div>
      <div className="req-side">
        <Badge color={STATUS_COLOR[r.status]}>{r.status}</Badge>
        {actions}
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Inventory Requests"
        subtitle="Request supplies → owner approves → purchase → added to stock"
        action={can.createRequest(profile) && <Button onClick={() => setShowNew(true)}>+ New request</Button>}
      />

      {!loading && needsMigration && (
        <Banner kind="info">⚙️ <strong>One step to enable requests:</strong> run <code>supabase/schema_v3.sql</code> in your Supabase SQL Editor.</Banner>
      )}

      {loading ? <Spinner /> : (
        <>
          <Card>
            <div className="card-head"><h2>Awaiting approval</h2><Badge color="#f9a825">{awaiting.length}</Badge></div>
            {awaiting.length === 0 ? <p className="muted">Nothing waiting.</p> : awaiting.map((r) => (
              <Row key={r.id} r={r} actions={
                <>
                  {can.approveRequest(profile) && <button className="link" onClick={() => approve(r)}>Approve</button>}
                  {can.approveRequest(profile) && <button className="link danger" onClick={() => reject(r)}>Reject</button>}
                  {!can.approveRequest(profile) && r.requested_by === user.id && <button className="link" onClick={() => cancel(r)}>Cancel</button>}
                </>
              } />
            ))}
          </Card>

          <Card>
            <div className="card-head"><h2>To purchase</h2><Badge color="#1565c0">{toBuy.length}</Badge></div>
            {toBuy.length === 0 ? <p className="muted">Nothing approved to buy.</p> : toBuy.map((r) => (
              <Row key={r.id} r={r} actions={
                can.purchaseRequest(profile)
                  ? <button className="link" onClick={() => setPurchasing(r)}>Mark purchased</button>
                  : null
              } />
            ))}
          </Card>

          {history.length > 0 && (
            <Card>
              <h2>History</h2>
              {history.map((r) => <Row key={r.id} r={r} actions={null} />)}
            </Card>
          )}
        </>
      )}

      {showNew && (
        <NewRequestModal items={items} zones={zones} userId={user.id}
          onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />
      )}
      {purchasing && (
        <PurchaseModal req={purchasing} userId={user.id}
          onClose={() => setPurchasing(null)} onSaved={() => { setPurchasing(null); load() }} />
      )}
    </div>
  )
}

function NewRequestModal({ items, zones, userId, onClose, onSaved }) {
  const [f, setF] = useState({ item_id: '', item_name: '', quantity: '', unit: '', zone_id: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const pickItem = (e) => {
    const id = e.target.value
    const it = items.find((i) => i.id === id)
    setF({ ...f, item_id: id, item_name: it ? it.name : f.item_name, unit: it?.unit || f.unit })
  }

  const save = async (e) => {
    e.preventDefault()
    const qty = Number(f.quantity)
    const name = f.item_id ? (items.find((i) => i.id === f.item_id)?.name) : f.item_name.trim()
    if (!name) return setError('Choose an item or type what you need.')
    if (!qty || qty <= 0) return setError('Enter a quantity greater than 0.')
    setBusy(true); setError(null)
    const { error } = await supabase.from('inventory_requests').insert({
      item_id: f.item_id || null, item_name: name, quantity: qty, unit: f.unit || null,
      zone_id: f.zone_id || null, reason: f.reason || null, requested_by: userId,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal title="Request inventory" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Existing item (optional)">
          <select value={f.item_id} onChange={pickItem}>
            <option value="">— New / not in stock list —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        {!f.item_id && (
          <Field label="What do you need?"><input value={f.item_name} onChange={set('item_name')} placeholder="e.g. Knapsack sprayer" required /></Field>
        )}
        <div className="row">
          <Field label="Quantity"><input type="number" step="any" min="0" value={f.quantity} onChange={set('quantity')} required /></Field>
          <Field label="Unit"><input value={f.unit} onChange={set('unit')} placeholder="bags, litres…" /></Field>
        </div>
        <Field label="For which zone (optional)">
          <select value={f.zone_id} onChange={set('zone_id')}>
            <option value="">— Not zone-specific —</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}
          </select>
        </Field>
        <Field label="Reason"><input value={f.reason} onChange={set('reason')} placeholder="why it's needed" /></Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function PurchaseModal({ req, userId, onClose, onSaved }) {
  const [qty, setQty] = useState(String(req.quantity))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    const purchased = Number(qty)
    if (!purchased || purchased <= 0) return setError('Enter the purchased quantity.')
    setBusy(true); setError(null)
    try {
      // 1) mark the request purchased
      const { error: rErr } = await supabase.from('inventory_requests').update({
        status: 'purchased', purchased_by: userId, purchased_quantity: purchased,
        purchased_at: new Date().toISOString(), notes: note || req.notes,
      }).eq('id', req.id)
      if (rErr) throw rErr

      // 2) add it to stock
      if (req.item_id) {
        const { error: mErr } = await supabase.from('stock_movements').insert({
          item_id: req.item_id, movement_type: 'in', quantity: purchased, unit: req.unit || null,
          reason: 'Purchased (request)', performed_by: userId,
        })
        if (mErr) throw mErr
      } else {
        // brand-new item — create it with the purchased quantity as the baseline
        const { error: iErr } = await supabase.from('inventory').insert({
          name: req.item_name, unit: req.unit || null, quantity: purchased, created_by: userId,
        })
        if (iErr) throw iErr
      }
      onSaved()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`Mark purchased — ${req.item_name}`} onClose={onClose}>
      <p className="muted small">Requested: <strong>{req.quantity} {req.unit || ''}</strong>. This amount will be added to stock.</p>
      <form onSubmit={save}>
        <Field label="Quantity purchased"><input type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} required /></Field>
        <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="supplier, cost…" /></Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Purchased → add to stock'}</Button>
        </div>
      </form>
    </Modal>
  )
}
