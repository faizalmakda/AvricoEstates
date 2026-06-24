import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Field } from '../components/ui'

export default function Login() {
  const { user, signIn, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await signIn(email, password)
    setBusy(false)
    if (error) setError(error.message)
    else navigate('/')
  }

  return (
    <div className="centered">
      <form className="card auth-card" onSubmit={onSubmit}>
        <div className="brand brand-lg">
          <span className="brand-mark">🌳</span>
          <span className="brand-name">Avrico Estates</span>
        </div>
        <p className="muted">Sign in to manage the estate.</p>

        <Field label="Email">
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        {error && <div className="banner banner-error">{error}</div>}

        <Button type="submit" className="btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="muted small">
          Accounts are created by a director. Ask an owner if you need access.
        </p>
      </form>
    </div>
  )
}
