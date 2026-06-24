import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase, evidenceUrl } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can, TREE_STATUSES, STATUS_COLORS } from '../lib/permissions'
import { uploadPhoto } from '../lib/upload'
import { Button, Card, Spinner, Badge, Field, Banner } from '../components/ui'

export default function TreeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const [tree, setTree] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [{ data: t }, { data: l }] = await Promise.all([
      supabase.from('trees').select('*').eq('id', id).single(),
      supabase
        .from('tree_logs')
        .select('*, by:logged_by(full_name)')
        .eq('tree_id', id)
        .order('created_at', { ascending: false }),
    ])
    setTree(t)
    setLogs(l ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id]) // eslint-disable-line

  if (loading) return <Spinner />
  if (!tree) return <Banner kind="error">Tree not found.</Banner>

  const archive = async () => {
    const next = !tree.archived
    if (!confirm(next ? 'Archive this tree?' : 'Restore this tree?')) return
    const { error } = await supabase
      .from('trees')
      .update({ archived: next, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return alert(error.message)
    load()
  }

  const remove = async () => {
    if (!confirm('Permanently delete this tree and its logs? This cannot be undone.')) return
    const { error } = await supabase.from('trees').delete().eq('id', id)
    if (error) return alert(error.message)
    navigate('/trees')
  }

  return (
    <div className="detail">
      <Link to="/trees" className="back-link">← Trees</Link>

      <Card>
        <div className="card-head">
          <h1>{tree.code}</h1>
          <Badge color={STATUS_COLORS[tree.status]}>{tree.status}</Badge>
        </div>
        <div className="meta-grid">
          <Meta label="Species" value={tree.species || '—'} />
          <Meta label="Location" value={tree.location || '—'} />
          <Meta label="Planted" value={tree.planted_on || '—'} />
        </div>
        {tree.notes && <p className="instructions">{tree.notes}</p>}

        {(can.editTree(profile) || can.deleteTree(profile)) && (
          <div className="detail-actions">
            {can.editTree(profile) && <EditTreeButton tree={tree} onSaved={load} />}
            {can.archiveTree(profile) && (
              <Button variant="secondary" onClick={archive}>
                {tree.archived ? 'Restore' : 'Archive'}
              </Button>
            )}
            {can.deleteTree(profile) && (
              <Button variant="danger" onClick={remove}>Delete</Button>
            )}
          </div>
        )}
      </Card>

      {/* Anyone (manager included) can ADD a status log. Existing logs are never changed. */}
      {can.addTreeLog(profile) && (
        <AddLogForm treeId={tree.id} userId={user.id} onDone={load} />
      )}

      <Card>
        <h2>Status history</h2>
        <p className="muted small">
          Every update is kept as a new entry — nothing is ever overwritten or deleted by the manager.
        </p>
        {logs.length === 0 ? (
          <p className="muted">No logs yet.</p>
        ) : (
          <ul className="timeline">
            {logs.map((l) => (
              <li key={l.id}>
                <div className="timeline-dot" style={{ background: STATUS_COLORS[l.status] }} />
                <div className="timeline-body">
                  <div className="timeline-head">
                    <strong>{l.status || 'Note'}</strong>
                    <span className="muted small">
                      {l.by?.full_name || 'Someone'} · {new Date(l.created_at).toLocaleString()}
                    </span>
                  </div>
                  {l.note && <p>{l.note}</p>}
                  {l.photo_path && (
                    <a href={evidenceUrl(l.photo_path)} target="_blank" rel="noreferrer">
                      <img className="evidence-thumb" src={evidenceUrl(l.photo_path)} alt="Tree log" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <div className="meta">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  )
}

function AddLogForm({ treeId, userId, onDone }) {
  const [status, setStatus] = useState('Healthy')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let photo_path = null
      if (file) photo_path = await uploadPhoto(file, `trees/${treeId}`)
      const { error } = await supabase.from('tree_logs').insert({
        tree_id: treeId,
        status,
        note: note || null,
        photo_path,
        logged_by: userId,
      })
      if (error) throw error
      // Keep the tree's headline status in sync with the latest log.
      await supabase.from('trees').update({ status }).eq('id', treeId)
      setNote('')
      setFile(null)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="complete-card">
      <h2>Log a status update</h2>
      <form onSubmit={submit}>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {TREE_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Photo">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        {error && <div className="banner banner-error">{error}</div>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add log entry'}</Button>
      </form>
    </Card>
  )
}

function EditTreeButton({ tree, onSaved }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(tree)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase
      .from('trees')
      .update({
        code: form.code,
        species: form.species,
        location: form.location,
        planted_on: form.planted_on || null,
        notes: form.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tree.id)
    setBusy(false)
    if (error) return alert(error.message)
    setOpen(false)
    onSaved()
  }

  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Edit</Button>

  return (
    <form className="inline-edit" onSubmit={save}>
      <div className="row">
        <Field label="Code"><input value={form.code} onChange={set('code')} required /></Field>
        <Field label="Species"><input value={form.species || ''} onChange={set('species')} /></Field>
      </div>
      <Field label="Location"><input value={form.location || ''} onChange={set('location')} /></Field>
      <Field label="Planted on"><input type="date" value={form.planted_on || ''} onChange={set('planted_on')} /></Field>
      <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
      <div className="modal-actions">
        <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}
