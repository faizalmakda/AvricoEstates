import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can, TREE_STATUSES, STATUS_COLORS } from '../lib/permissions'
import { buildTreeCode, isValidPositions } from '../lib/treeCode'
import { uploadPhoto } from '../lib/upload'
import { enqueue, isOfflineError } from '../lib/outbox'
import { cachedSelect, cacheDelete } from '../lib/cache'
import {
  Button, Card, PageHeader, Spinner, Badge, Modal, Field, EmptyState, Banner,
} from '../components/ui'

export default function TreeRegister() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [zones, setZones] = useState([])
  const [trees, setTrees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const zoneFilter = params.get('zone') || ''
  const statusFilter = params.get('status') || ''
  const q = params.get('q') || ''

  const load = async () => {
    setLoading(true)
    const [{ data: z }, { data: t }] = await Promise.all([
      cachedSelect('zones-full', supabase.from('zones').select('*').order('code')),
      cachedSelect('trees-full', supabase
        .from('trees')
        .select('*, zone:zone_id(code)')
        .eq('archived', false)
        .order('code')),
    ])
    setZones(z ?? [])
    setTrees((t ?? []).filter((x) => !x.deleted_at))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setFilter = (key, val) => {
    const next = new URLSearchParams(params)
    if (val) next.set(key, val)
    else next.delete(key)
    setParams(next)
  }

  const visible = useMemo(() => {
    return trees.filter((t) => {
      if (zoneFilter && t.zone?.code !== zoneFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      if (q) {
        const hay = `${t.code} ${t.species || ''} ${t.location || ''}`.toLowerCase()
        if (!hay.includes(q.toLowerCase())) return false
      }
      return true
    })
  }, [trees, zoneFilter, statusFilter, q])

  return (
    <div>
      <Link to="/orchard" className="back-link">← Orchard</Link>
      <PageHeader
        title="Tree Register"
        subtitle={`${visible.length} tree${visible.length === 1 ? '' : 's'}${zoneFilter ? ` in ${zoneFilter}` : ''}`}
        action={can.registerTree(profile) && <Button onClick={() => setShowAdd(true)}>+ Add tree</Button>}
      />

      {!loading && zones.length === 0 && (
        <Banner kind="info">
          ⚙️ <strong>One step to finish setup:</strong> run <code>supabase/schema_v2.sql</code> in
          your Supabase SQL Editor to activate the orchard zones and tree register.
        </Banner>
      )}

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search ID, species, location…"
          defaultValue={q}
          onChange={(e) => setFilter('q', e.target.value)}
        />
        <select value={zoneFilter} onChange={(e) => setFilter('zone', e.target.value)}>
          <option value="">All zones</option>
          {zones.map((z) => <option key={z.id} value={z.code}>{z.code}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {TREE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState icon="🌳" title="No trees here">
          {can.registerTree(profile)
            ? 'Add a tree to start building your register.'
            : 'No trees match these filters.'}
        </EmptyState>
      ) : (
        <Card className="table-card">
          <table className="table">
            <thead>
              <tr><th>Tree ID</th><th>Species</th><th>Status</th><th>Last inspection</th></tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="clickable-row">
                  <td data-label="Tree ID">
                    <Link to={`/trees/${t.id}`} className="mono-link">{t.code}</Link>
                  </td>
                  <td data-label="Species">{t.species || '—'}</td>
                  <td data-label="Status"><Badge color={STATUS_COLORS[t.status]}>{t.status}</Badge></td>
                  <td data-label="Last inspection">{t.last_inspection_on || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showAdd && (
        <AddTreeModal
          zones={zones}
          defaultZone={zoneFilter}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add tree with DUPLICATE PREVENTION
// ---------------------------------------------------------------------------
function AddTreeModal({ zones, defaultZone, onClose, onSaved }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    zoneCode: defaultZone || (zones[0]?.code ?? ''),
    row: '',
    tree: '',
    species: '',
    planted_on: '',
    status: 'Healthy',
    notes: '',
  })
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [queued, setQueued] = useState(false)
  const [duplicate, setDuplicate] = useState(null) // existing tree row if found

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const zone = zones.find((z) => z.code === form.zoneCode)
  const code = buildTreeCode(form.zoneCode, form.row, form.tree)

  const save = async (e) => {
    e.preventDefault()
    setError(null)
    if (!zone) return setError('Please choose a zone.')
    if (!isValidPositions(form.row, form.tree)) return setError('Row and tree number must be 1 or higher.')

    setBusy(true); setQueued(false)
    const treeRow = {
      code,
      zone_id: zone.id,
      row_number: Number(form.row),
      tree_number: Number(form.tree),
      species: form.species || null,
      planted_on: form.planted_on || null,
      status: form.status,
      notes: form.notes || null,
      created_by: user.id,
    }

    try {
      // 1) Duplicate check — never create two trees at the same position.
      const { data: existing, error: dupErr } = await supabase
        .from('trees').select('*').eq('code', code).maybeSingle()
      if (dupErr) throw dupErr

      if (existing) {
        if (existing.archived || existing.deleted_at) {
          const { error: delErr } = await supabase.rpc('delete_tree_cascade', { _tree_id: existing.id })
          if (delErr) throw delErr
        } else {
          setBusy(false)
          setDuplicate(existing) // genuinely active tree — show the "already exists" dialog
          return
        }
      }

      // 2) Create the new tree.
      const { data: created, error: insErr } = await supabase.from('trees').insert(treeRow).select('id').single()
      if (insErr) throw insErr

      // 3) Optional first photo for the tree's history.
      if (photo && created) {
        const path = await uploadPhoto(photo, `trees/${created.id}/photos`)
        await supabase.from('tree_photos').insert({
          tree_id: created.id, photo_path: path, caption: 'Registration photo', uploaded_by: user.id,
        })
      }
      await cacheDelete(['trees-full', 'trees-min'])
      setBusy(false)
      onSaved()
    } catch (err) {
      // No signal? Queue the registration (and photo) to sync later.
      if (isOfflineError(err)) {
        const treeId = crypto.randomUUID()
        await enqueue({ table: 'trees', row: { id: treeId, ...treeRow } })
        if (photo) {
          await enqueue({
            table: 'tree_photos',
            row: { tree_id: treeId, caption: 'Registration photo', uploaded_by: user.id },
            photo: { file: photo, folder: `trees/${treeId}/photos`, field: 'photo_path' },
          })
        }
        setBusy(false); setQueued(true)
      } else {
        setBusy(false); setError(err.message)
      }
    }
  }

  // The duplicate dialog (matches the required logic exactly).
  if (duplicate) {
    return (
      <Modal title="Tree already exists" onClose={onClose}>
        <Banner kind="info">
          This tree already exists: <strong>{duplicate.code}</strong>.<br />
          Current status: <strong>{duplicate.status}</strong>.<br />
          Do you want to update this tree record instead?
        </Banner>
        <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setDuplicate(null)}>Cancel</Button>
          <Button variant="secondary" onClick={() => navigate(`/trees/${duplicate.id}?tab=history`)}>
            View history
          </Button>
          <Button onClick={() => navigate(`/trees/${duplicate.id}?edit=1`)}>
            Update existing record
          </Button>
        </div>
      </Modal>
    )
  }

  if (queued) {
    return (
      <Modal title="Saved offline" onClose={onClose}>
        <Banner kind="info">
          📴 Tree <strong>{code}</strong> saved on your phone. It will be registered automatically when you have signal.
        </Banner>
        <p className="muted small">
          Note: the duplicate check runs when it syncs — if that position was taken while you were offline, it'll be flagged in the sync bar.
        </p>
        <div className="modal-actions"><Button onClick={onClose}>Done</Button></div>
      </Modal>
    )
  }

  return (
    <Modal title="Add tree" onClose={onClose}>
      <form onSubmit={save}>
        <div className="row">
          <Field label="Zone">
            <select value={form.zoneCode} onChange={set('zoneCode')} required>
              {zones.map((z) => <option key={z.id} value={z.code}>{z.code}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set('status')}>
              {TREE_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label="Row number"><input type="number" min="1" value={form.row} onChange={set('row')} required /></Field>
          <Field label="Tree number"><input type="number" min="1" value={form.tree} onChange={set('tree')} required /></Field>
        </div>

        <div className="code-preview">
          Tree ID: <strong>{code || '—'}</strong>
        </div>

        <Field label="Species"><input value={form.species} onChange={set('species')} placeholder="e.g. Hass Avocado" /></Field>
        <Field label="Planted on"><input type="date" value={form.planted_on} onChange={set('planted_on')} /></Field>
        <Field label="Notes"><textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
        <Field label="Photo (optional)" hint="Auto-compressed before saving">
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </Field>

        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Add tree'}</Button>
        </div>
      </form>
    </Modal>
  )
}
