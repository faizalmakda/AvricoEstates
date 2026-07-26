import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { NotificationsProvider } from './notifications/NotificationsContext.jsx'
import './styles.css'

// Take scroll control away from the browser for the whole app so its own
// restoration never fights ours (which snapped the tree list back to the top
// on back-navigation). Individual pages restore their own position.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'

// HashRouter keeps deep links working on GitHub Pages (no server-side routing).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <NotificationsProvider>
          <App />
        </NotificationsProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
)
