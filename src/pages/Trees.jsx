import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can, TREE_STATUSES, STATUS_COLORS } from '../lib/permissions'
import { Button, PageHeader, Spinner, Badge, Modal, Field, EmptyState } from '../components/ui'

export default function Trees() {
  const { profile, user } = useAuth()
  const [trees, setTrees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [q, setQ] = useState('')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('trees')
      .select('*')
      .order('code', { ascending: true })
    setTrees(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const visible = trees
    .filter((t) => (showArchived ? true : !t.archived))
    .filter((t) =>
      q
        ? `${t.code} ${t.species} ${t.location}`.toLowerCase().includes(q.toLowerCase())
        : true
    )

  return (
    <div>
      <PageHeader
        title="Trees"
        subtitle="Every tree on the estate"
        action={
          can.createTree(profile) && <Button onClick={() => setShowNew(true)}>+ Add tree</Button>
        }
      />

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search code, species, location…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState icon="🌳" title="No trees yet">
          {can.createTree(profile) ? 'Add your first tree to start tracking it.' : 'No trees to show.'}
        </EmptyState>
      ) : (
        <div className="tree-grid">
          {visible.map((t) => (
            <Link key={t.id} to={`/trees/${t.id}`} className={`tree-card ${t.archived ? 'archived' : ''}`}>
              <div className="tree-card-head">
                <span className="tree-code">{t.code}</span>
                <Badge color={STATUS_COLORS[t.status]}>{t.status}</Badge>
              </div>
              <div className="tree-species">{t.species || 'Unknown species'}</div>
              <div className="muted small">{t.location || 'No location'}</div>
              {t.archived && <div className="archived-tag">Archived</div>}
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <NewTreeModal
          userId={user.id}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function NewTreeModal({ userId, onClose, onSaved }) {
  const [form, setForm] = useState({
    code: '',
    species: '',
    location: '',
    planted_on: '',
    status: 'Healthy',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('trees').insert({
      code: form.code,
      species: form.species || null,
      location: form.location || null,
      planted_on: form.planted_on || null,
      status: form.status,
      notes: form.notes || null,
      created_by: userId,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal title="Add tree" onClose={onClose}>
      <form onSubmit={save}>
        <div className="row">
          <Field label="Code" hint="e.g. A-014">
            <input value={form.code} onChange={set('code')} required />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set('status')}>
              {TREE_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Species">
          <input value={form.species} onChange={set('species')} />
        </Field>
        <Field label="Location">
          <input value={form.location} onChange={set('location')} />
        </Field>
        <Field label="Planted on">
          <input type="date" value={form.planted_on} onChange={set('planted_on')} />
        </Field>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add tree'}</Button>
        </div>
      </form>
    </Modal>
  )
}
