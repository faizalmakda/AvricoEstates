// Shown when the app was built without Supabase connection details.
export default function NotConfigured() {
  return (
    <div className="centered">
      <div className="card auth-card">
        <div className="brand brand-lg">
          <span className="brand-mark">🌳</span>
          <span className="brand-name">Avrico Estates</span>
        </div>
        <h2>Almost there — one setup step left</h2>
        <p className="muted">
          This app needs to be connected to your free Supabase database before
          it can sign anyone in.
        </p>
        <ol className="setup-list">
          <li>Create a free project at <strong>supabase.com</strong>.</li>
          <li>
            Copy the <strong>Project URL</strong> and <strong>anon key</strong>{' '}
            (Project Settings → API).
          </li>
          <li>
            Add them as <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> — locally in a <code>.env</code>{' '}
            file, or as GitHub Action secrets for the live site.
          </li>
        </ol>
        <p className="muted">
          Full step-by-step instructions are in <code>SETUP.md</code>.
        </p>
      </div>
    </div>
  )
}
