import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can, isOwner } from '../lib/permissions'
import { fetchNameMap, nameOf } from '../lib/people'
import { cachedSelect } from '../lib/cache'
import { useNotifications } from '../notifications/NotificationsContext'
import { Button, Card, PageHeader, Spinner, Badge, Modal, Field, EmptyState } from '../components/ui'

// A task is overdue if its due date has passed and it isn't finished/cancelled.
export const isOverdue = (t) =>
  t.due_date && !['Completed', 'Cancelled'].includes(t.status) &&
  new Date(t.due_date) < new Date(new Date().toDateString())

export const taskStatusColor = (s) =>
  s === 'Completed' ? '#2e7d32' : s === 'Cancelled' ? '#6f7a6a' : '#1565c0'

export default function Tasks() {
  const { profile } = useAuth()
  const owner = isOwner(profile)
  const [tasks, setTasks] = useState([])
  const [people, setPeople] = useState([])
  const [zones, setZones] = useState([])
  const [items, setItems] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('Mine')
  const [showNew, setShowNew] = useState(false)
  const { markSeen } = useNotifications()
  useEffect(() => { markSeen('tasks') }, [markSeen])

  const load = async () => {
    setLoading(true)
    // RLS automatically limits the manager to his own tasks.
    const [{ data }, { data: z }, { data: it }, nameMap] = await Promise.all([
      cachedSelect(`tasks:${profile?.id}`, supabase.from('tasks')
        .select('*, zone:zone_id(code), tree:tree_id(code), item:inventory_item_id(name)')
        .order('created_at', { ascending: false })),
      cachedSelect('zones', supabase.from('zones').select('id,code').order('code')),
      cachedSelect('inventory-min', supabase.from('inventory').select('id,name').order('name')),
      fetchNameMap(),
    ])
    setTasks(data ?? [])
    setZones(z ?? [])
    setItems(it ?? [])
    setNames(nameMap)
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

  const open = (t) => !['Completed', 'Cancelled'].includes(t.status)
  const mineCount = tasks.filter((t) => t.assigned_to === profile?.id && open(t)).length
  const visible = tasks.filter((t) =>
    filter === 'Mine' ? t.assigned_to === profile?.id
      : filter === 'All' ? true
        : filter === 'Open' ? open(t)
          : t.status === 'Completed'
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
        {['Mine', 'Open', 'Completed', 'All'].map((f) => (
          <button
            key={f}
            className={filter === f ? 'seg active' : 'seg'}
            onClick={() => setFilter(f)}
          >
            {f === 'Mine' && mineCount > 0 ? `Mine (${mineCount})` : f}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState icon="✅" title={filter === 'Mine' ? 'Nothing assigned to you' : 'No tasks here'}>
          {filter === 'Mine'
            ? 'You have no tasks assigned right now. Tap “All” to see every task.'
            : owner ? 'Create a task to assign work to the team.' : 'You have no tasks in this view.'}
        </EmptyState>
      ) : (
        <div className="card-list">
          {visible.map((t) => (
            <Link key={t.id} to={`/tasks/${t.id}`} className="task-card">
              <div className="task-main">
                <div className="task-title">{t.title}</div>
                <div className="muted small">
                  {t.assigned_to ? `For ${nameOf(names, t.assigned_to)}` : 'Unassigned'}
                  {t.due_date ? ` · Due ${t.due_date}` : ''}
                </div>
                {(t.zone?.code || t.tree?.code || t.item?.name) && (
                  <div className="muted small">
                    🔗 {[t.zone?.code && `Zone ${t.zone.code}`, t.tree?.code, t.item?.name].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div className="task-side">
                {isOverdue(t) && <Badge color="#b5392b">Overdue</Badge>}
                {t.priority === 'High' && <Badge color="#ef6c00">High</Badge>}
                <Badge color={taskStatusColor(t.status)}>{t.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <NewTaskModal
          people={people}
          zones={zones}
          items={items}
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

function NewTaskModal({ people, zones, items, onClose, onSaved }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    title: '',
    instructions: '',
    assigned_to: '',
    priority: 'Normal',
    due_date: '',
    zone_id: '',
    inventory_item_id: '',
    tree_code: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Optionally link a tree by its ID code.
    let tree_id = null
    if (form.tree_code.trim()) {
      const { data: tr } = await supabase.from('trees').select('id').eq('code', form.tree_code.trim().toUpperCase()).maybeSingle()
      if (!tr) { setBusy(false); return setError(`No tree found with ID "${form.tree_code.trim().toUpperCase()}".`) }
      tree_id = tr.id
    }
    const { error } = await supabase.from('tasks').insert({
      title: form.title,
      instructions: form.instructions || null,
      assigned_to: form.assigned_to || null,
      priority: form.priority,
      due_date: form.due_date || null,
      zone_id: form.zone_id || null,
      inventory_item_id: form.inventory_item_id || null,
      tree_id,
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

        <p className="section-label">Link to (optional)</p>
        <div className="row">
          <Field label="Zone">
            <select value={form.zone_id} onChange={set('zone_id')}>
              <option value="">— None —</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}
            </select>
          </Field>
          <Field label="Tree ID" hint="e.g. B2-R01-T003">
            <input value={form.tree_code} onChange={set('tree_code')} />
          </Field>
        </div>
        <Field label="Inventory item">
          <select value={form.inventory_item_id} onChange={set('inventory_item_id')}>
            <option value="">— None —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>

        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create task'}</Button>
        </div>
      </form>
    </Modal>
  )
}
