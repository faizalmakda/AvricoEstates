import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { supabase, evidenceUrl } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can, TREE_STATUSES, STATUS_COLORS } from '../lib/permissions'
import { fetchNameMap, nameOf, lastEdited } from '../lib/people'
import { uploadPhoto } from '../lib/upload'
import { queueIfOffline } from '../lib/outbox'
import { cachedSelect, cacheDelete } from '../lib/cache'
import { Button, Card, Spinner, Badge, Field, Banner } from '../components/ui'

// Cache keys to clear after a tree changes, so stale copies don't linger offline.
const treeCacheKeys = (id) => ['trees-full', 'trees-min',
  `tree:${id}`, `tree-insp:${id}`, `tree-treat:${id}`, `tree-photos:${id}`, `tree-logs:${id}`, `tree-repl:${id}`]

const TABS = ['Overview', 'Inspections', 'Treatments', 'Photos', 'History']

export default function TreeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { profile, user } = useAuth()
  const [tree, setTree] = useState(null)
  const [data, setData] = useState({ inspections: [], treatments: [], photos: [], logs: [], replacements: [] })
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(params.get('tab') === 'history' ? 'History' : 'Overview')
  const [editing, setEditing] = useState(params.get('edit') === '1')

  const load = async () => {
    const [{ data: t }, insp, treat, ph, logs, repl, nameMap] = await Promise.all([
      cachedSelect(`tree:${id}`, supabase.from('trees').select('*, zone:zone_id(code)').eq('id', id).single()),
      cachedSelect(`tree-insp:${id}`, supabase.from('tree_inspections').select('*').eq('tree_id', id).order('inspection_date', { ascending: false })),
      cachedSelect(`tree-treat:${id}`, supabase.from('tree_treatments').select('*').eq('tree_id', id).order('treatment_date', { ascending: false })),
      cachedSelect(`tree-photos:${id}`, supabase.from('tree_photos').select('*').eq('tree_id', id).order('created_at', { ascending: false })),
      cachedSelect(`tree-logs:${id}`, supabase.from('tree_logs').select('*').eq('tree_id', id).order('created_at', { ascending: false })),
      cachedSelect(`tree-repl:${id}`, supabase.from('tree_replacements').select('*').eq('tree_id', id).order('replaced_on', { ascending: false })),
      fetchNameMap(),
    ])
    setTree(t)
    setData({
      inspections: insp.data ?? [],
      treatments: treat.data ?? [],
      photos: ph.data ?? [],
      logs: logs.data ?? [],
      replacements: repl.data ?? [],
    })
    setNames(nameMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line

  if (loading) return <Spinner />
  if (!tree) return <Banner kind="error">Tree not found.</Banner>

  const deleteInspection = async (i) => {
    if (!confirm('Delete this inspection permanently? This cannot be undone.')) return
    if (i.photo_path) await supabase.storage.from('evidence').remove([i.photo_path])
    const { error } = await supabase.from('tree_inspections').delete().eq('id', i.id)
    if (error) return alert(error.message)
    load()
  }

  const deletePhoto = async (p) => {
    if (!confirm('Delete this photo permanently? This cannot be undone.')) return
    if (p.photo_path) await supabase.storage.from('evidence').remove([p.photo_path])
    const { error } = await supabase.from('tree_photos').delete().eq('id', p.id)
    if (error) return alert(error.message)
    load()
  }

  const remove = async () => {
    if (!confirm('Permanently delete this tree and ALL its records (inspections, treatments, photos, status logs)?\n\nThis cannot be undone. The position will be free to register again.')) return
    // Best-effort cleanup of this tree's photos from storage.
    const paths = [
      ...data.photos.map((p) => p.photo_path),
      ...data.inspections.map((i) => i.photo_path),
      ...data.logs.map((l) => l.photo_path),
    ].filter(Boolean)
    if (paths.length) await supabase.storage.from('evidence').remove(paths)
    const { error } = await supabase.rpc('delete_tree_cascade', { _tree_id: id })
    if (error) return alert(error.message)
    await cacheDelete(treeCacheKeys(id))
    navigate('/orchard')
  }

  return (
    <div className="detail">
      <Link to="/trees" className="back-link">← Tree Register</Link>

      <Card>
        <div className="card-head">
          <div>
            <h1 className="mono">{tree.code}</h1>
            <div className="muted small">
              {tree.zone?.code ? `Zone ${tree.zone.code}` : ''}
              {tree.row_number ? ` · Row ${tree.row_number}` : ''}
              {tree.tree_number ? ` · Tree ${tree.tree_number}` : ''}
            </div>
          </div>
          <Badge color={STATUS_COLORS[tree.status]}>{tree.status}</Badge>
        </div>

        {editing ? (
          <EditTree tree={tree} onDone={() => { setEditing(false); load() }} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div className="meta-grid">
              <Meta label="Species" value={tree.species || '—'} />
              <Meta label="Planted" value={tree.planted_on || '—'} />
              <Meta label="Last inspection" value={tree.last_inspection_on || '—'} />
            </div>
            {tree.notes && <p className="instructions">{tree.notes}</p>}
            {lastEdited(names, tree) && <p className="muted small">✎ {lastEdited(names, tree)}</p>}
            <div className="detail-actions">
              {can.editTree(profile) && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
              {can.recordReplacement(profile) && (
                <ReplaceButton tree={tree} userId={user.id} onDone={load} />
              )}
              {can.archiveTree(profile) && <Button variant="danger" onClick={remove}>Remove tree</Button>}
            </div>
          </>
        )}
      </Card>

      <div className="segmented">
        {TABS.map((tb) => (
          <button key={tb} className={tab === tb ? 'seg active' : 'seg'} onClick={() => setTab(tb)}>
            {tb}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <Card>
          <h2>Summary</h2>
          <ul className="list">
            <li className="list-row"><span>Inspections</span><strong>{data.inspections.length}</strong></li>
            <li className="list-row"><span>Treatments</span><strong>{data.treatments.length}</strong></li>
            <li className="list-row"><span>Photos</span><strong>{data.photos.length}</strong></li>
            <li className="list-row"><span>Replacements</span><strong>{data.replacements.length}</strong></li>
          </ul>
        </Card>
      )}

      {tab === 'Inspections' && (
        <>
          {can.addInspection(profile) && <AddInspection treeId={id} userId={user.id} onDone={load} />}
          <Timeline
            items={data.inspections}
            render={(i) => ({
              title: i.status || 'Inspection',
              color: STATUS_COLORS[i.status],
              meta: `${nameOf(names, i.inspector_id)} · ${i.inspection_date}`,
              body: i.findings,
              photo: i.photo_path,
              onDelete: can.editTree(profile) ? () => deleteInspection(i) : undefined,
            })}
            empty="No inspections logged yet."
          />
        </>
      )}

      {tab === 'Treatments' && (
        <>
          {can.addTreatment(profile) && <AddTreatment treeId={id} userId={user.id} onDone={load} />}
          <Timeline
            items={data.treatments}
            render={(t) => ({
              title: t.product || 'Treatment',
              meta: `${nameOf(names, t.applied_by)} · ${t.treatment_date}`,
              body: [t.reason, t.quantity ? `${t.quantity} ${t.unit || ''}` : '', t.notes].filter(Boolean).join(' · '),
            })}
            empty="No treatments recorded yet."
          />
        </>
      )}

      {tab === 'Photos' && (
        <>
          {can.addTreePhoto(profile) && <AddPhoto treeId={id} userId={user.id} onDone={load} />}
          {data.photos.length === 0 ? (
            <Card><p className="muted">No photos yet. Add one above to start this tree's photo history.</p></Card>
          ) : (
            <div className="photo-grid">
              {data.photos.map((p) => (
                <div key={p.id} className="photo-tile">
                  <a href={evidenceUrl(p.photo_path)} target="_blank" rel="noreferrer">
                    <img src={evidenceUrl(p.photo_path)} alt={p.caption || 'Tree photo'} />
                  </a>
                  <span>
                    <strong>{new Date(p.created_at).toLocaleDateString()}</strong>
                    {p.caption ? ` · ${p.caption}` : ''}
                    <br />{nameOf(names, p.uploaded_by)}
                  </span>
                  {can.editTree(profile) && (
                    <button className="link danger" onClick={() => deletePhoto(p)}>Delete</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'History' && (
        <>
          {can.addTreeLog(profile) && <AddLog treeId={id} userId={user.id} onDone={load} />}
          {data.replacements.length > 0 && (
            <Card>
              <h2>Replacement history</h2>
              <ul className="timeline">
                {data.replacements.map((r) => (
                  <li key={r.id}>
                    <div className="timeline-dot" style={{ background: '#1565c0' }} />
                    <div className="timeline-body">
                      <div className="timeline-head">
                        <strong>Replaced</strong>
                        <span className="muted small">{nameOf(names, r.performed_by)} · {r.replaced_on}</span>
                      </div>
                      {(r.reason || r.notes) && <p>{[r.reason, r.notes].filter(Boolean).join(' · ')}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <h2>Status log</h2>
            <Timeline
              bare
              items={data.logs}
              render={(l) => ({
                title: l.status || 'Note',
                color: STATUS_COLORS[l.status],
                meta: `${nameOf(names, l.logged_by)} · ${new Date(l.created_at).toLocaleDateString()}`,
                body: l.note,
                photo: l.photo_path,
              })}
              empty="No status changes logged yet."
            />
          </Card>
        </>
      )}
    </div>
  )
}

function Meta({ label, value }) {
  return <div className="meta"><span className="meta-label">{label}</span><span className="meta-value">{value}</span></div>
}

function Timeline({ items, render, empty, bare }) {
  if (items.length === 0) {
    return bare ? <p className="muted">{empty}</p> : <Card><p className="muted">{empty}</p></Card>
  }
  const list = (
    <ul className="timeline">
      {items.map((it) => {
        const r = render(it)
        return (
          <li key={it.id}>
            <div className="timeline-dot" style={r.color ? { background: r.color } : undefined} />
            <div className="timeline-body">
              <div className="timeline-head">
                <strong>{r.title}</strong>
                <span className="muted small">{r.meta}</span>
              </div>
              {r.body && <p>{r.body}</p>}
              {r.photo && (
                <a href={evidenceUrl(r.photo)} target="_blank" rel="noreferrer">
                  <img className="evidence-thumb" src={evidenceUrl(r.photo)} alt="" />
                </a>
              )}
              {r.onDelete && <div><button className="link danger" onClick={r.onDelete}>Delete</button></div>}
            </div>
          </li>
        )
      })}
    </ul>
  )
  return bare ? list : <Card>{list}</Card>
}

// ---- Forms ----------------------------------------------------------------
function AddInspection({ treeId, userId, onDone }) {
  const [f, setF] = useState({ status: 'Healthy', findings: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [queued, setQueued] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null); setQueued(false)
    const today = new Date().toISOString().slice(0, 10) // auto-stamped, no manual entry
    const row = { tree_id: treeId, inspection_date: today, status: f.status, findings: f.findings || null, inspector_id: userId }
    // Latest findings become the tree's notes (the current advice for this tree).
    const after = {
      table: 'trees', match: { id: treeId },
      patch: { status: f.status, last_inspection_on: today, ...(f.findings ? { notes: f.findings } : {}) },
    }
    try {
      let photo_path = null
      if (file) photo_path = await uploadPhoto(file, `trees/${treeId}/inspections`)
      const { error } = await supabase.from('tree_inspections').insert({ ...row, photo_path })
      if (error) throw error
      await supabase.from('trees').update(after.patch).eq('id', treeId)
      setF({ ...f, findings: '' }); setFile(null); onDone()
    } catch (e) {
      const offline = await queueIfOffline(e, {
        table: 'tree_inspections', row, after,
        photo: file ? { file, folder: `trees/${treeId}/inspections`, field: 'photo_path' } : null,
      })
      if (offline) { setF({ ...f, findings: '' }); setFile(null); setQueued(true) }
      else setErr(e.message)
    } finally { setBusy(false) }
  }
  return (
    <Card className="complete-card">
      <h2>Log an inspection</h2>
      <form onSubmit={submit}>
        <Field label="Status found">
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {TREE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Findings"><textarea rows={2} value={f.findings} onChange={(e) => setF({ ...f, findings: e.target.value })} /></Field>
        <Field label="Photo"><input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        {err && <div className="banner banner-error">{err}</div>}
        {queued && <div className="banner banner-info">📴 Saved on your phone — it will upload automatically when you have signal.</div>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save inspection'}</Button>
      </form>
    </Card>
  )
}

function AddTreatment({ treeId, userId, onDone }) {
  const [f, setF] = useState({ product: '', reason: '', quantity: '', unit: '', date: new Date().toISOString().slice(0, 10) })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.from('tree_treatments').insert({
      tree_id: treeId, treatment_date: f.date, product: f.product || null, reason: f.reason || null,
      quantity: f.quantity ? Number(f.quantity) : null, unit: f.unit || null, applied_by: userId,
    })
    setBusy(false)
    if (error) setErr(error.message)
    else { setF({ ...f, product: '', reason: '', quantity: '' }); onDone() }
  }
  return (
    <Card className="complete-card">
      <h2>Record a treatment</h2>
      <form onSubmit={submit}>
        <Field label="Product"><input value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} placeholder="e.g. Copper fungicide" /></Field>
        <div className="row">
          <Field label="Quantity"><input type="number" step="any" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
          <Field label="Unit"><input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="ml, g" /></Field>
        </div>
        <Field label="Reason / notes"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        {err && <div className="banner banner-error">{err}</div>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save treatment'}</Button>
      </form>
    </Card>
  )
}

function AddPhoto({ treeId, userId, onDone }) {
  const [file, setFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [queued, setQueued] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!file) return setErr('Choose a photo first.')
    setBusy(true); setErr(null); setQueued(false)
    const row = { tree_id: treeId, caption: caption || null, uploaded_by: userId }
    try {
      const photo_path = await uploadPhoto(file, `trees/${treeId}/photos`)
      const { error } = await supabase.from('tree_photos').insert({ ...row, photo_path })
      if (error) throw error
      setFile(null); setCaption(''); onDone()
    } catch (e) {
      const offline = await queueIfOffline(e, {
        table: 'tree_photos', row,
        photo: { file, folder: `trees/${treeId}/photos`, field: 'photo_path' },
      })
      if (offline) { setFile(null); setCaption(''); setQueued(true) }
      else setErr(e.message)
    } finally { setBusy(false) }
  }
  return (
    <Card className="complete-card">
      <h2>Add a photo</h2>
      <form onSubmit={submit}>
        <Field label="Photo"><input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <Field label="Caption"><input value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
        {err && <div className="banner banner-error">{err}</div>}
        {queued && <div className="banner banner-info">📴 Saved on your phone — it will upload automatically when you have signal.</div>}
        <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload photo'}</Button>
      </form>
    </Card>
  )
}

function AddLog({ treeId, userId, onDone }) {
  const [status, setStatus] = useState('Healthy')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setQueued(false)
    const today = new Date().toISOString().slice(0, 10)
    const row = { tree_id: treeId, status, note: note || null, logged_by: userId }
    const after = { table: 'trees', match: { id: treeId }, patch: { status, last_inspection_on: today } }
    try {
      const { error } = await supabase.from('tree_logs').insert(row)
      if (error) throw error
      await supabase.from('trees').update(after.patch).eq('id', treeId)
      setNote(''); onDone()
    } catch (e) {
      const offline = await queueIfOffline(e, { table: 'tree_logs', row, after })
      if (offline) { setNote(''); setQueued(true) }
      else alert(e.message)
    } finally { setBusy(false) }
  }
  return (
    <Card className="complete-card">
      <h3>Quick status update</h3>
      <form onSubmit={submit}>
        <div className="row">
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {TREE_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        {queued && <div className="banner banner-info">📴 Saved on your phone — it will sync when you have signal.</div>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add to log'}</Button>
      </form>
    </Card>
  )
}

function ReplaceButton({ tree, userId, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    const { error } = await supabase.from('tree_replacements').insert({
      tree_id: tree.id, previous_status: tree.status, reason: reason || null, performed_by: userId,
    })
    if (!error) {
      await supabase.from('trees').update({ status: 'Healthy', planted_on: new Date().toISOString().slice(0, 10) }).eq('id', tree.id)
    }
    setBusy(false)
    if (error) alert(error.message)
    else { setOpen(false); setReason(''); onDone() }
  }
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Record replacement</Button>
  return (
    <div className="inline-edit">
      <Field label="Reason for replacement"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. died from disease" /></Field>
      <div className="modal-actions">
        <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="button" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Confirm replacement'}</Button>
      </div>
    </div>
  )
}

function EditTree({ tree, onDone, onCancel }) {
  const [f, setF] = useState(tree)
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setQueued(false)
    const patch = {
      species: f.species, planted_on: f.planted_on || null,
      status: f.status, notes: f.notes,
      last_inspection_on: new Date().toISOString().slice(0, 10),
    }
    try {
      const { error } = await supabase.from('trees').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', tree.id)
      if (error) throw error
      await cacheDelete(treeCacheKeys(tree.id))
      onDone()
    } catch (e) {
      const offline = await queueIfOffline(e, { op: 'update', table: 'trees', match: { id: tree.id }, patch })
      if (offline) setQueued(true)
      else alert(e.message)
    } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} className="inline-edit">
      <Banner kind="info">Tree ID <strong>{tree.code}</strong> is fixed. To move a tree to a new position, archive this one and register the new position.</Banner>
      <div className="row">
        <Field label="Status">
          <select value={f.status} onChange={set('status')}>{TREE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Species"><input value={f.species || ''} onChange={set('species')} /></Field>
      </div>
      <Field label="Planted on"><input type="date" value={f.planted_on || ''} onChange={set('planted_on')} /></Field>
      <Field label="Notes"><textarea rows={2} value={f.notes || ''} onChange={set('notes')} /></Field>
      {queued && <div className="banner banner-info">📴 Saved on your phone — changes will sync when you have signal.</div>}
      <div className="modal-actions">
        <Button variant="ghost" type="button" onClick={onCancel}>{queued ? 'Close' : 'Cancel'}</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </form>
  )
}
