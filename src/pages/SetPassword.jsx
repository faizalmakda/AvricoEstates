import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Field } from '../components/ui'
import logo from '../assets/logo.jpg'

// Shown when the user clicks the link in a "forgot password" email.
export default function SetPassword() {
  const { updatePassword, clearRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true); setError(null)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) return setError(error.message)
    clearRecovery()
    navigate('/')
  }

  return (
    <div className="centered">
      <form className="card auth-card" onSubmit={submit}>
        <img className="auth-logo" src={logo} alt="Avrico Estates" />
        <p className="muted">Choose a new password for your account.</p>
        <Field label="New password">
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Confirm new password">
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && <div className="banner banner-error">{error}</div>}
        <Button type="submit" className="btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</Button>
      </form>
    </div>
  )
}
