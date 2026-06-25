import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase, evidenceUrl } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can, isOwner, isManager } from '../lib/permissions'
import { fetchNameMap, nameOf } from '../lib/people'
import { isOverdue, taskStatusColor as statusColor } from './Tasks'
import { uploadPhoto } from '../lib/upload'
import { Button, Card, Spinner, Badge, Field, Banner } from '../components/ui'

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const owner = isOwner(profile)
  const [task, setTask] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [{ data: t }, { data: subs }, nameMap] = await Promise.all([
      supabase.from('tasks').select('*, zone:zone_id(code), tree:tree_id(code), item:inventory_item_id(name)').eq('id', id).single(),
      supabase
        .from('task_submissions')
        .select('*')
        .eq('task_id', id)
        .order('created_at', { ascending: false }),
      fetchNameMap(),
    ])
    setTask(t)
    setSubmissions(subs ?? [])
    setNames(nameMap)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id]) // eslint-disable-line

  if (loading) return <Spinner />
  if (!task) return <Banner kind="error">Task not found, or you don't have access to it.</Banner>

  const overdue = isOverdue(task)

  const deleteTask = async () => {
    if (!confirm('Delete this task permanently?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return alert(error.message)
    navigate('/tasks')
  }

  return (
    <div className="detail">
      <Link to="/tasks" className="back-link">← Tasks</Link>

      <Card>
        <div className="card-head">
          <h1>{task.title}</h1>
          <div className="task-side">
            {overdue && <Badge color="#b5392b">Overdue</Badge>}
            <Badge color={statusColor(task.status)}>{task.status}</Badge>
          </div>
        </div>
        <div className="meta-grid">
          <Meta label="Assigned to" value={task.assigned_to ? nameOf(names, task.assigned_to) : 'Unassigned'} />
          <Meta label="Priority" value={task.priority} />
          <Meta label="Due" value={task.due_date || '—'} />
        </div>
        {(task.zone?.code || task.tree?.code || task.item?.name) && (
          <p className="muted small">🔗 Linked: {[task.zone?.code && `Zone ${task.zone.code}`, task.tree?.code, task.item?.name].filter(Boolean).join(' · ')}</p>
        )}
        {task.instructions && (
          <>
            <h3 className="section-label">Instructions</h3>
            <p className="instructions">{task.instructions}</p>
          </>
        )}

        {/* Owners can edit/delete and set status; the manager cannot. */}
        {owner && (
          <>
            <div className="detail-actions">
              <EditTaskButton task={task} onSaved={load} />
              <Button variant="danger" onClick={deleteTask}>Delete task</Button>
            </div>
            <Field label="Set status">
              <select value={task.status} onChange={async (e) => {
                const { error } = await supabase.from('tasks').update({ status: e.target.value, updated_at: new Date().toISOString() }).eq('id', task.id)
                if (error) alert(error.message); else load()
              }}>
                {['Pending', 'In Progress', 'Completed', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </>
        )}
      </Card>

      {/* Manager (or owner) marks the task complete with evidence. */}
      {can.completeTask(profile) && task.status !== 'Completed' && (
        <CompleteForm taskId={task.id} userId={user.id} onDone={load} />
      )}

      <Card>
        <h2>Completion history & evidence</h2>
        {submissions.length === 0 ? (
          <p className="muted">No submissions yet.</p>
        ) : (
          <ul className="timeline">
            {submissions.map((s) => (
              <li key={s.id}>
                <div className="timeline-dot" />
                <div className="timeline-body">
                  <div className="timeline-head">
                    <strong>{s.status}</strong>
                    <span className="muted small">
                      {nameOf(names, s.submitted_by)} ·{' '}
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                  </div>
                  {s.note && <p>{s.note}</p>}
                  {s.photo_path && (
                    <a href={evidenceUrl(s.photo_path)} target="_blank" rel="noreferrer">
                      <img className="evidence-thumb" src={evidenceUrl(s.photo_path)} alt="Evidence" />
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

function CompleteForm({ taskId, userId, onDone }) {
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('Completed')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let photo_path = null
      if (file) photo_path = await uploadPhoto(file, `tasks/${taskId}`)
      // A NEW append-only submission row — it never overwrites the task.
      const { error } = await supabase.from('task_submissions').insert({
        task_id: taskId,
        status,
        note: note || null,
        photo_path,
        submitted_by: userId,
      })
      if (error) throw error
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
      <h2>Mark progress / complete</h2>
      <form onSubmit={submit}>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
        </Field>
        <Field label="Note" hint="Describe what you did.">
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Photo evidence" hint="Take or attach a photo.">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        {error && <div className="banner banner-error">{error}</div>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit update'}
        </Button>
      </form>
    </Card>
  )
}

function EditTaskButton({ task, onSaved }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(task)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase
      .from('tasks')
      .update({
        title: form.title,
        instructions: form.instructions,
        priority: form.priority,
        due_date: form.due_date || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)
    setBusy(false)
    if (error) return alert(error.message)
    setOpen(false)
    onSaved()
  }

  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Edit</Button>

  return (
    <form className="inline-edit" onSubmit={save}>
      <Field label="Title">
        <input value={form.title} onChange={set('title')} required />
      </Field>
      <Field label="Instructions">
        <textarea rows={3} value={form.instructions || ''} onChange={set('instructions')} />
      </Field>
      <div className="row">
        <Field label="Priority">
          <select value={form.priority} onChange={set('priority')}>
            <option>Low</option><option>Normal</option><option>High</option>
          </select>
        </Field>
        <Field label="Due date">
          <input type="date" value={form.due_date || ''} onChange={set('due_date')} />
        </Field>
      </div>
      <div className="modal-actions">
        <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}
