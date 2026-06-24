import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { Button, PageHeader, Spinner, Modal, Field, Card, Banner } from '../components/ui'

export default function Users() {
  const { user, profile } = useAuth()
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setPeople(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setRole = async (p, role) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    if (error) return alert(error.message)
    load()
  }

  const toggleActive = async (p) => {
    const { error } = await supabase.from('profiles').update({ active: !p.active }).eq('id', p.id)
    if (error) return alert(error.message)
    load()
  }

  const owners = people.filter((p) => p.role === 'owner').length

  return (
    <div>
      <PageHeader
        title="Users & permissions"
        subtitle="Owners have full access. Farm managers are limited to their tasks and tree logs."
        action={<Button onClick={() => setShowNew(true)}>+ Add user</Button>}
      />

      <Banner kind="info">
        <strong>Owner / Admin</strong> = full access (the 3 directors). &nbsp;
        <strong>Farm Manager</strong> = view assigned tasks, complete them with photo
        evidence, and add tree status logs only.
      </Banner>

      {loading ? (
        <Spinner />
      ) : (
        <Card className="table-card">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Access level</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td data-label="Name">
                    <strong>{p.full_name}</strong>
                    {p.id === user.id && <span className="muted small"> (you)</span>}
                  </td>
                  <td data-label="Access level">
                    <select
                      value={p.role}
                      disabled={p.id === user.id && owners <= 1}
                      onChange={(e) => setRole(p, e.target.value)}
                    >
                      <option value="owner">Owner / Admin (full access)</option>
                      <option value="manager">Farm Manager (limited)</option>
                    </select>
                  </td>
                  <td data-label="Status">
                    <span className={p.active ? 'role-pill role-owner' : 'role-pill role-off'}>
                      {p.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="row-actions">
                    {p.id !== user.id && (
                      <button className="link" onClick={() => toggleActive(p)}>
                        {p.active ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showNew && (
        <AddUserModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />
      )}
    </div>
  )
}

function AddUserModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'manager' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      // Calls the secure Edge Function (verifies you're an owner server-side).
      const { data, error } = await supabase.functions.invoke('create-user', { body: form })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      onSaved()
    } catch (err) {
      setError(
        `${err.message}. If you haven't deployed the "create-user" function yet, you can ` +
        `instead add the user in your Supabase dashboard (Authentication → Add user), then ` +
        `set their role here.`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Full name"><input value={form.full_name} onChange={set('full_name')} required /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Temporary password" hint="At least 6 characters. They can change it later.">
          <input type="text" value={form.password} onChange={set('password')} required minLength={6} />
        </Field>
        <Field label="Access level">
          <select value={form.role} onChange={set('role')}>
            <option value="manager">Farm Manager (limited)</option>
            <option value="owner">Owner / Admin (full access)</option>
          </select>
        </Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</Button>
        </div>
      </form>
    </Modal>
  )
}
