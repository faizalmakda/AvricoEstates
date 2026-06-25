import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { isDemo } from '../supabaseClient'
import { DEMO_ACCOUNTS } from '../lib/mockBackend'
import { Button, Field } from '../components/ui'
import logo from '../assets/logo.jpg'

export default function Login() {
  const { user, signIn, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  const doSignIn = async (em, pw) => {
    setError(null)
    setBusy(true)
    const { error } = await signIn(em, pw)
    setBusy(false)
    if (error) setError(error.message)
    else navigate('/')
  }

  const onSubmit = (e) => {
    e.preventDefault()
    doSignIn(email, password)
  }

  return (
    <div className="centered">
      <form className="card auth-card" onSubmit={onSubmit}>
        <img className="auth-logo" src={logo} alt="Avrico Estates" />
        <p className="muted">Sign in to manage the estate.</p>

        {isDemo && (
          <div className="demo-box">
            <div className="banner banner-info" style={{ textAlign: 'left' }}>
              <strong>Demo mode</strong> — sample data, no setup needed. Tap a
              person to log in and see what they can do.
            </div>
            <div className="demo-people">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  className="demo-person"
                  disabled={busy}
                  onClick={() => doSignIn(a.email, 'demo')}
                >
                  <span className="demo-name">{a.label}</span>
                  <span className={`role-pill role-${a.role}`}>
                    {a.role === 'owner' ? 'Owner / Admin' : 'Farm Manager'}
                  </span>
                </button>
              ))}
            </div>
            <div className="demo-divider"><span>or sign in manually</span></div>
          </div>
        )}

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
