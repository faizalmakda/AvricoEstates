import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { can, ROLE_LABELS } from '../lib/permissions'
import { isDemo } from '../supabaseClient'
import { resetDemo } from '../lib/mockBackend'

// Navigation items. `show` decides visibility based on the user's role.
const NAV = [
  { to: '/', label: 'Dashboard', icon: '🏠', show: () => true, end: true },
  { to: '/orchard', label: 'Orchard', icon: '🗺️', show: () => true },
  { to: '/trees', label: 'Trees', icon: '🌳', show: () => true },
  { to: '/tasks', label: 'Tasks', icon: '✅', show: () => true },
  { to: '/inventory', label: 'Inventory', icon: '📦', show: () => true },
  { to: '/produce', label: 'Yield', icon: '🧺', show: () => true },
  { to: '/reports', label: 'Reports', icon: '📊', show: (p) => can.viewReports(p) },
  { to: '/users', label: 'Users', icon: '👥', show: (p) => can.manageUsers(p) },
]

export default function Layout({ children }) {
  const { profile, signOut, user } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const items = NAV.filter((n) => n.show(profile))

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">🌳</span>
          <span className="brand-name">Avrico Estates</span>
        </div>

        <nav className="nav">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
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
          <button className="btn btn-ghost btn-block" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar (with account menu + sign out) */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🌳</span>
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
                </NavLink>
              ))}
            </nav>
            <button className="btn btn-danger btn-block" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      )}

      <main className="content">
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
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
