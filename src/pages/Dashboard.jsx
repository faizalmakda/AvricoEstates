import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can, isOwner } from '../lib/permissions'
import { Card, PageHeader, Spinner, Badge } from '../components/ui'

export default function Dashboard() {
  const { profile } = useAuth()
  const owner = isOwner(profile)
  const [stats, setStats] = useState(null)
  const [myTasks, setMyTasks] = useState([])
  const [recentLogs, setRecentLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [trees, tasks, inventory, produce, logs] = await Promise.all([
        supabase.from('trees').select('id,status,archived'),
        supabase.from('tasks').select('id,title,status,priority,due_date,assigned_to'),
        supabase.from('inventory').select('id,quantity'),
        supabase.from('produce').select('quantity,harvested_on'),
        supabase
          .from('tree_logs')
          .select('id,status,note,created_at,tree_id,trees(code)')
          .order('created_at', { ascending: false })
          .limit(6),
      ])
      if (!active) return

      const treeRows = trees.data ?? []
      const taskRows = tasks.data ?? []
      const thisMonth = (produce.data ?? []).filter((p) => {
        const d = new Date(p.harvested_on)
        const now = new Date()
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })

      setStats({
        trees: treeRows.filter((t) => !t.archived).length,
        needAttention: treeRows.filter((t) =>
          ['Diseased', 'Weak', 'Needs Inspection', 'Dead'].includes(t.status)
        ).length,
        openTasks: taskRows.filter((t) => t.status !== 'Completed').length,
        inventoryItems: (inventory.data ?? []).length,
        yieldThisMonth: thisMonth.reduce((s, p) => s + Number(p.quantity || 0), 0),
      })
      setMyTasks(
        taskRows
          .filter((t) => t.status !== 'Completed')
          .filter((t) => owner || t.assigned_to === profile?.id)
          .slice(0, 6)
      )
      setRecentLogs(logs.data ?? [])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [owner, profile?.id])

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title={`Welcome, ${(profile?.full_name || '').split(' ')[0] || 'there'} 👋`}
        subtitle={owner ? 'Estate overview' : 'Your work for today'}
      />

      {owner && (
        <div className="stat-grid">
          <StatCard to="/trees" icon="🌳" value={stats.trees} label="Active trees" />
          <StatCard
            to="/trees"
            icon="⚠️"
            value={stats.needAttention}
            label="Need attention"
            tone={stats.needAttention ? 'warn' : undefined}
          />
          <StatCard to="/tasks" icon="✅" value={stats.openTasks} label="Open tasks" />
          <StatCard to="/inventory" icon="📦" value={stats.inventoryItems} label="Inventory items" />
          <StatCard
            to="/produce"
            icon="🧺"
            value={`${stats.yieldThisMonth}`}
            label="Yield this month"
          />
        </div>
      )}

      <div className="dash-cols">
        <Card>
          <div className="card-head">
            <h2>{owner ? 'Open tasks' : 'Tasks assigned to you'}</h2>
            <Link to="/tasks" className="link">View all</Link>
          </div>
          {myTasks.length === 0 ? (
            <p className="muted">Nothing outstanding. 🎉</p>
          ) : (
            <ul className="list">
              {myTasks.map((t) => (
                <li key={t.id}>
                  <Link to={`/tasks/${t.id}`} className="list-row">
                    <div>
                      <div className="list-title">{t.title}</div>
                      <div className="muted small">
                        {t.due_date ? `Due ${t.due_date}` : 'No due date'}
                      </div>
                    </div>
                    <Badge color={t.priority === 'High' ? '#c62828' : undefined}>
                      {t.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="card-head">
            <h2>Recent tree updates</h2>
            <Link to="/trees" className="link">Trees</Link>
          </div>
          {recentLogs.length === 0 ? (
            <p className="muted">No tree logs yet.</p>
          ) : (
            <ul className="list">
              {recentLogs.map((l) => (
                <li key={l.id}>
                  <Link to={`/trees/${l.tree_id}`} className="list-row">
                    <div>
                      <div className="list-title">
                        {l.trees?.code || 'Tree'} · {l.status || 'Note'}
                      </div>
                      <div className="muted small">{l.note || '—'}</div>
                    </div>
                    <span className="muted small">
                      {new Date(l.created_at).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function StatCard({ to, icon, value, label, tone }) {
  return (
    <Link to={to} className={`stat-card ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </Link>
  )
}
