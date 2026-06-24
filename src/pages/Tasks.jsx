import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can, isOwner } from '../lib/permissions'
import { Button, Card, PageHeader, Spinner, Badge, Modal, Field, EmptyState } from '../components/ui'

export default function Tasks() {
  const { profile } = useAuth()
  const owner = isOwner(profile)
  const [tasks, setTasks] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('Open')
  const [showNew, setShowNew] = useState(false)

  const load = async () => {
    setLoading(true)
    // RLS automatically limits the manager to his own tasks.
    const { data } = await supabase
      .from('tasks')
      .select('*, assignee:assigned_to(full_name)')
      .order('created_at', { ascending: false })
    setTasks(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    if (can.assignTask(profile)) {
      supabase
        .from('profiles')
        .select('id,full_name,role')
        .eq('active', true)
        .then(({ data }) => setPeople(data ?? []))
    }
  }, []) // eslint-disable-line

  const visible = tasks.filter((t) =>
    filter === 'All' ? true : filter === 'Open' ? t.status !== 'Completed' : t.status === 'Completed'
  )

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={owner ? 'All estate tasks' : 'Tasks assigned to you'}
        action={
          can.createTask(profile) && (
            <Button onClick={() => setShowNew(true)}>+ New task</Button>
          )
        }
      />

      <div className="segmented">
        {['Open', 'Completed', 'All'].map((f) => (
          <button
            key={f}
            className={filter === f ? 'seg active' : 'seg'}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState icon="✅" title="No tasks here">
          {owner ? 'Create a task to assign work to the farm manager.' : 'You have no tasks in this view.'}
        </EmptyState>
      ) : (
        <div className="card-list">
          {visible.map((t) => (
            <Link key={t.id} to={`/tasks/${t.id}`} className="task-card">
              <div className="task-main">
                <div className="task-title">{t.title}</div>
                <div className="muted small">
                  {t.assignee?.full_name ? `For ${t.assignee.full_name}` : 'Unassigned'}
                  {t.due_date ? ` · Due ${t.due_date}` : ''}
                </div>
              </div>
              <div className="task-side">
                {t.priority === 'High' && <Badge color="#c62828">High</Badge>}
                <Badge color={t.status === 'Completed' ? '#2e7d32' : '#1565c0'}>
                  {t.status}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <NewTaskModal
          people={people}
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

function NewTaskModal({ people, onClose, onSaved }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    title: '',
    instructions: '',
    assigned_to: '',
    priority: 'Normal',
    due_date: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('tasks').insert({
      title: form.title,
      instructions: form.instructions || null,
      assigned_to: form.assigned_to || null,
      priority: form.priority,
      due_date: form.due_date || null,
      created_by: user.id,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal title="New task" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Title">
          <input value={form.title} onChange={set('title')} required />
        </Field>
        <Field label="Instructions" hint="The manager can read these but cannot change them.">
          <textarea rows={4} value={form.instructions} onChange={set('instructions')} />
        </Field>
        <Field label="Assign to">
          <select value={form.assigned_to} onChange={set('assigned_to')}>
            <option value="">— Unassigned —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} {p.role === 'owner' ? '(owner)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <div className="row">
          <Field label="Priority">
            <select value={form.priority} onChange={set('priority')}>
              <option>Low</option>
              <option>Normal</option>
              <option>High</option>
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" value={form.due_date} onChange={set('due_date')} />
          </Field>
        </div>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create task'}</Button>
        </div>
      </form>
    </Modal>
  )
}
