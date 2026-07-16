import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useNotifications } from '../notifications/NotificationsContext'
import { can, ROLE_LABELS } from '../lib/permissions'
import { isDemo } from '../supabaseClient'
import { resetDemo } from '../lib/mockBackend'
import { Button, Modal, Field } from './ui'
import { subscribe, getStatus, processOutbox, retryFailed, discardFailed } from '../lib/outbox'
import logoMark from '../assets/logo-mark.png'

// Navigation items. `show` decides visibility based on the user's role.
const NAV = [
  { to: '/', label: 'Dashboard', icon: '🏠', show: () => true, end: true },
  { to: '/orchard', label: 'Orchard', icon: '🌳', show: () => true },
  { to: '/tasks', label: 'Tasks', icon: '✅', show: () => true },
  { to: '/inventory', label: 'Inventory', icon: '📦', show: () => true },
  { to: '/requests', label: 'Requests', icon: '🧾', show: (p) => can.viewRequests(p) },
  { to: '/produce', label: 'Yield', icon: '🧺', show: () => true },
  { to: '/reports', label: 'Reports', icon: '📊', show: (p) => can.viewReports(p) },
  { to: '/game', label: 'Play', icon: '🎮', show: () => true },
  { to: '/activity', label: 'Activity', icon: '📜', show: (p) => can.viewAudit(p) },
  { to: '/users', label: 'Users', icon: '👥', show: (p) => can.manageUsers(p) },
]

export default function Layout({ children }) {
  const { profile, signOut, user } = useAuth()
  const { counts } = useNotifications()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const items = NAV.filter((n) => n.show(profile))
  const badgeFor = (to) => (to === '/tasks' ? counts.tasks : to === '/requests' ? counts.requests : 0)

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/login')
  }
  const openChangePw = () => { setMenuOpen(false); setPwOpen(true) }

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo" style={{ backgroundImage: `url(${logoMark})` }} />
          <span className="brand-name">Avrico Estates</span>
        </div>

        <nav className="nav">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
              {badgeFor(n.to) > 0 && <span className="nav-badge">{badgeFor(n.to)}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="who">
            <div className="who-name">{profile?.full_name ?? user?.email}</div>
            <div className={`role-pill role-${profile?.role}`}>
              {ROLE_LABELS[profile?.role] ?? 'User'}
            </div>
          </div>
          <button className="link" onClick={openChangePw}>Change password</button>
          <button className="btn btn-ghost btn-block" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar (with account menu + sign out) */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo" style={{ backgroundImage: `url(${logoMark})` }} />
          <span className="brand-name">Avrico Estates</span>
        </div>
        <button
          className="topbar-account"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Account menu"
        >
          <span className="avatar">{(profile?.full_name || user?.email || '?').charAt(0).toUpperCase()}</span>
        </button>
      </header>

      {menuOpen && (
        <div className="sheet-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-who">
              <div className="who-name">{profile?.full_name ?? user?.email}</div>
              <div className={`role-pill role-${profile?.role}`}>
                {ROLE_LABELS[profile?.role] ?? 'User'}
              </div>
            </div>
            <nav className="sheet-nav">
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className="sheet-link"
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="nav-icon">{n.icon}</span>
                  <span>{n.label}</span>
                  {badgeFor(n.to) > 0 && <span className="nav-badge">{badgeFor(n.to)}</span>}
                </NavLink>
              ))}
            </nav>
            <button className="btn btn-ghost btn-block" onClick={openChangePw}>
              Change password
            </button>
            <button className="btn btn-danger btn-block" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}

      <main className="content">
        <SyncIndicator />
        {isDemo && (
          <div className="demo-ribbon">
            🧪 Demo mode — sample data stored only in this browser.
            <button
              className="link"
              onClick={() => {
                if (confirm('Reset the demo back to its original sample data?')) {
                  resetDemo()
                  window.location.reload()
                }
              }}
            >
              Reset demo data
            </button>
          </div>
        )}
        {children}
      </main>

      {/* Bottom tab bar for phones */}
      <nav className="tabbar">
        {items.slice(0, 5).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="tab">
            <span className="tab-icon">{n.icon}</span>
            <span className="tab-label">{n.label}</span>
            {badgeFor(n.to) > 0 && <span className="tab-badge">{badgeFor(n.to)}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function SyncIndicator() {
  const [s, setS] = useState(getStatus())
  useEffect(() => subscribe(setS), [])
  if (!s.pending && !s.failed) return null
  return (
    <div className="sync-ribbon">
      {s.syncing
        ? `⏳ Syncing ${s.pending} saved item${s.pending === 1 ? '' : 's'}…`
        : `📴 ${s.pending} item${s.pending === 1 ? '' : 's'} waiting to upload`}
      {s.failed > 0 && ` · ${s.failed} failed`}
      {!s.syncing && navigator.onLine && s.pending > 0 && (
        <button className="link" onClick={() => processOutbox()}>Sync now</button>
      )}
      {s.failed > 0 && (
        <>
          <button className="link" onClick={() => retryFailed()}>Retry failed</button>
          <button
            className="link"
            onClick={() => {
              if (confirm(`Discard ${s.failed} item${s.failed === 1 ? '' : 's'} that can't sync? This is safe when they are duplicates already saved on the server.`)) discardFailed()
            }}
          >Discard failed</button>
        </>
      )}
      {s.failed > 0 && s.failedReason && (
        <div className="muted small" style={{ flexBasis: '100%' }}>Why it failed: {s.failedReason}</div>
      )}
    </div>
  )
}

function ChangePasswordModal({ onClose }) {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    if (isDemo) return setError('Changing password is not available in demo mode.')
    setBusy(true); setError(null)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) setError(error.message)
    else setDone(true)
  }

  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? (
        <>
          <div className="banner banner-info">Your password has been updated.</div>
          <div className="modal-actions"><Button onClick={onClose}>Done</Button></div>
        </>
      ) : (
        <form onSubmit={submit}>
          <Field label="New password">
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Field label="Confirm new password">
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
