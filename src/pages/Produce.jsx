import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can } from '../lib/permissions'
import { Button, PageHeader, Spinner, Modal, Field, EmptyState, Card, Banner } from '../components/ui'

const PRODUCE_TYPES = ['Avocado', 'Groundnuts']
const SEND_REASONS = ['Sold', 'Moved', 'Used', 'Spoilage']
const REASON_STATUS = { Sold: 'sold', Moved: 'moved', Used: 'used', Spoilage: 'used' }

export default function Produce() {
  const { profile, user } = useAuth()
  const manage = can.manageProduce(profile)
  const [tab, setTab] = useState('Harvests')
  const [zones, setZones] = useState([])
  const [locations, setLocations] = useState([])
  const [yields, setYields] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'harvest' | 'location' | {batch}

  const load = async () => {
    setLoading(true)
    const [z, loc, yr, bt] = await Promise.all([
      supabase.from('zones').select('id,code').order('code'),
      supabase.from('storage_locations').select('*').order('name'),
      supabase.from('yield_records').select('*, zone:zone_id(code), storage:storage_location_id(name)').order('harvest_date', { ascending: false }),
      supabase.from('produce_batches').select('*, zone:zone_id(code), storage:storage_location_id(name)').order('created_at', { ascending: false }),
    ])
    setZones(z.data ?? [])
    setLocations(loc.data ?? [])
    setYields(yr.data ?? [])
    setBatches(bt.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const yieldByZone = useMemo(() => {
    const m = {}
    yields.forEach((y) => {
      const k = y.zone?.code || '—'
      m[k] = (m[k] || 0) + Number(y.quantity || 0)
    })
    return m
  }, [yields])
  const totalYield = Object.values(yieldByZone).reduce((s, n) => s + n, 0)
  const maxZone = Math.max(1, ...Object.values(yieldByZone))

  const inStorage = useMemo(() => {
    const m = {}
    batches.filter((b) => b.status === 'in_storage').forEach((b) => {
      m[b.produce_type] = (m[b.produce_type] || 0) + Number(b.quantity || 0)
    })
    return m
  }, [batches])

  return (
    <div>
      <PageHeader
        title="Yield & Produce"
        subtitle={`${totalYield} total harvested · ${Object.values(inStorage).reduce((s, n) => s + n, 0)} in storage`}
        action={manage && tab === 'Harvests' && <Button onClick={() => setModal('harvest')}>+ Record harvest</Button>}
      />

      {!loading && zones.length === 0 && (
        <Banner kind="info">⚙️ Run <code>supabase/schema_v2.sql</code> in Supabase to enable yield & storage.</Banner>
      )}

      <div className="segmented">
        {['Harvests', 'Storage'].map((t) => (
          <button key={t} className={tab === t ? 'seg active' : 'seg'} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {loading ? <Spinner /> : tab === 'Harvests' ? (
        <>
          <Card>
            <h2>Yield by zone</h2>
            {Object.keys(yieldByZone).length === 0 ? (
              <p className="muted">No harvests recorded yet.</p>
            ) : (
              Object.entries(yieldByZone).sort((a, b) => b[1] - a[1]).map(([zone, n]) => (
                <div key={zone} className="bar-row">
                  <span className="bar-label">Zone {zone}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / maxZone) * 100}%`, background: '#4d7a32' }} /></div>
                  <span className="bar-value">{n}</span>
                </div>
              ))
            )}
          </Card>

          {yields.length > 0 && (
            <Card className="table-card">
              <table className="table">
                <thead><tr><th>Date</th><th>Zone</th><th>Produce</th><th>Qty</th><th>Grade</th><th>Storage</th></tr></thead>
                <tbody>
                  {yields.map((y) => (
                    <tr key={y.id}>
                      <td data-label="Date">{y.harvest_date}</td>
                      <td data-label="Zone">{y.zone?.code || '—'}</td>
                      <td data-label="Produce"><strong>{y.produce_type}</strong></td>
                      <td data-label="Qty">{y.quantity} {y.unit}</td>
                      <td data-label="Grade">{y.grade || '—'}</td>
                      <td data-label="Storage">{y.storage?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      ) : (
        <>
          <Card>
            <div className="card-head">
              <h2>Total available in storage</h2>
              {manage && <Button variant="secondary" onClick={() => setModal('location')}>+ Storage location</Button>}
            </div>
            {Object.keys(inStorage).length === 0 ? (
              <p className="muted">Nothing in storage.</p>
            ) : (
              <div className="status-chips">
                {Object.entries(inStorage).map(([type, n]) => (
                  <span key={type} className="status-chip" style={{ borderColor: '#4d7a32', fontSize: '.9rem' }}>
                    <strong>{n}</strong>&nbsp;{type}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {batches.filter((b) => b.status === 'in_storage').length === 0 ? (
            <EmptyState icon="🧺" title="No produce in storage">
              {manage ? 'Record a harvest into a storage location to track it here.' : 'Nothing in storage.'}
            </EmptyState>
          ) : (
            <Card className="table-card">
              <table className="table">
                <thead><tr><th>Produce</th><th>From</th><th>Available</th><th>Location</th>{manage && <th></th>}</tr></thead>
                <tbody>
                  {batches.filter((b) => b.status === 'in_storage').map((b) => (
                    <tr key={b.id}>
                      <td data-label="Produce"><strong>{b.produce_type}</strong>{b.grade && <div className="muted small">Grade {b.grade}</div>}</td>
                      <td data-label="From">{b.zone?.code || '—'}</td>
                      <td data-label="Available">{b.quantity} {b.unit}</td>
                      <td data-label="Location">{b.storage?.name || '—'}</td>
                      {manage && <td className="row-actions"><button className="link" onClick={() => setModal({ batch: b })}>Send out</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {modal === 'harvest' && (
        <HarvestModal zones={zones} locations={locations} userId={user.id}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
      {modal === 'location' && (
        <LocationModal onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
      {modal?.batch && (
        <SendOutModal batch={modal.batch} userId={user.id}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
    </div>
  )
}

function HarvestModal({ zones, locations, userId, onClose, onSaved }) {
  const [f, setF] = useState({
    zone_id: zones[0]?.id || '', produce_type: 'Avocado', quantity: '', unit: 'kg',
    grade: '', harvest_date: new Date().toISOString().slice(0, 10), storage_location_id: '', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    const qty = Number(f.quantity)
    if (!qty || qty <= 0) return setError('Enter a quantity greater than 0.')
    setBusy(true); setError(null)
    // 1) the harvest record (yield by block)
    const { data: yr, error: yErr } = await supabase.from('yield_records').insert({
      zone_id: f.zone_id || null, produce_type: f.produce_type, quantity: qty, unit: f.unit || 'kg',
      grade: f.grade || null, harvest_date: f.harvest_date, storage_location_id: f.storage_location_id || null,
      notes: f.notes || null, recorded_by: userId,
    }).select().single()
    // 2) if stored somewhere, also create a storage batch so "available" tracks it
    if (!yErr && f.storage_location_id) {
      await supabase.from('produce_batches').insert({
        produce_type: f.produce_type, zone_id: f.zone_id || null, yield_id: yr?.id || null,
        grade: f.grade || null, quantity: qty, unit: f.unit || 'kg',
        storage_location_id: f.storage_location_id, status: 'in_storage',
      })
    }
    setBusy(false)
    if (yErr) setError(yErr.message)
    else onSaved()
  }

  return (
    <Modal title="Record harvest" onClose={onClose}>
      <form onSubmit={save}>
        <div className="row">
          <Field label="Zone / block">
            <select value={f.zone_id} onChange={set('zone_id')} required>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}
            </select>
          </Field>
          <Field label="Produce">
            <input list="ptypes" value={f.produce_type} onChange={set('produce_type')} required />
            <datalist id="ptypes">{PRODUCE_TYPES.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
        </div>
        <div className="row">
          <Field label="Quantity"><input type="number" step="any" min="0" value={f.quantity} onChange={set('quantity')} required /></Field>
          <Field label="Unit"><input value={f.unit} onChange={set('unit')} /></Field>
        </div>
        <div className="row">
          <Field label="Grade" hint="e.g. 1, 2, reject"><input value={f.grade} onChange={set('grade')} /></Field>
          <Field label="Harvest date"><input type="date" value={f.harvest_date} onChange={set('harvest_date')} /></Field>
        </div>
        <Field label="Store in (optional)" hint="Adds it to storage so it counts as available">
          <select value={f.storage_location_id} onChange={set('storage_location_id')}>
            <option value="">— Don't add to storage —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Notes"><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record harvest'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function LocationModal({ onClose, onSaved }) {
  const [f, setF] = useState({ name: '', kind: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError(null)
    const { error } = await supabase.from('storage_locations').insert({
      name: f.name, kind: f.kind || null, notes: f.notes || null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }
  return (
    <Modal title="Add storage location" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="e.g. Cold Room 1" /></Field>
        <Field label="Type"><input value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} placeholder="e.g. shed, cold room" /></Field>
        <Field label="Notes"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function SendOutModal({ batch, userId, onClose, onSaved }) {
  const [f, setF] = useState({ quantity: '', reason: 'Sold', destination: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    const qty = Number(f.quantity)
    if (!qty || qty <= 0) return setError('Enter a quantity greater than 0.')
    if (qty > Number(batch.quantity)) return setError(`Only ${batch.quantity} ${batch.unit} available.`)
    setBusy(true); setError(null)
    const { error: mErr } = await supabase.from('produce_movements').insert({
      batch_id: batch.id, movement_type: 'out', quantity: qty,
      reason: f.reason, destination: f.destination || null, performed_by: userId,
    })
    if (!mErr) {
      const remaining = Number(batch.quantity) - qty
      await supabase.from('produce_batches').update({
        quantity: remaining,
        status: remaining <= 0 ? REASON_STATUS[f.reason] : 'in_storage',
      }).eq('id', batch.id)
    }
    setBusy(false)
    if (mErr) setError(mErr.message)
    else onSaved()
  }

  return (
    <Modal title={`Send out — ${batch.produce_type}`} onClose={onClose}>
      <p className="muted small">Available: <strong>{batch.quantity} {batch.unit}</strong></p>
      <form onSubmit={save}>
        <div className="row">
          <Field label="Quantity"><input type="number" step="any" min="0" value={f.quantity} onChange={set('quantity')} autoFocus required /></Field>
          <Field label="Reason">
            <select value={f.reason} onChange={set('reason')}>{SEND_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </Field>
        </div>
        <Field label="Destination / buyer (optional)"><input value={f.destination} onChange={set('destination')} /></Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Send out'}</Button>
        </div>
      </form>
    </Modal>
  )
}
