import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { isOwner } from '../lib/permissions'
import { STATUS_COLORS } from '../lib/permissions'
import { fetchNameMap, nameOf } from '../lib/people'
import { cachedSelectAll } from '../lib/cache'
import { isOverdue } from './Tasks'
import { Card, PageHeader, Spinner, Badge, Banner } from '../components/ui'

function currentStock(item, movements) {
  return Number(item.quantity || 0) + movements
    .filter((m) => m.item_id === item.id)
    .reduce((s, m) => s + (m.movement_type === 'out' ? -Number(m.quantity || 0)
      : (m.movement_type === 'in' || m.movement_type === 'adjust') ? Number(m.quantity || 0) : 0), 0)
}

export default function Dashboard() {
  const { profile } = useAuth()
  const owner = isOwner(profile)
  const [d, setD] = useState(null)

  useEffect(() => {
    let on = true
    ;(async () => {
      const [zones, trees, tasks, inv, mv, batches, yields, insp, reqs, names] = await Promise.all([
        supabase.from('zones').select('id,code').order('code'),
        cachedSelectAll('dash-trees', (from, to) =>
          supabase.from('trees').select('id,status,zone_id,archived,deleted_at').order('id').range(from, to)),
        supabase.from('tasks').select('id,title,status,due_date,assigned_to'),
        supabase.from('inventory').select('id,name,quantity,min_stock,unit'),
        supabase.from('stock_movements').select('item_id,movement_type,quantity'),
        supabase.from('produce_batches').select('produce_type,quantity,unit,status'),
        supabase.from('yield_records').select('quantity,zone_id, zone:zone_id(code)'),
        supabase.from('tree_inspections').select('status,created_at,inspection_date,inspector_id, tree:tree_id(code)').order('created_at', { ascending: false }).limit(6),
        supabase.from('inventory_requests').select('status'),
        fetchNameMap(),
      ])
      if (!on) return

      const treeRows = (trees.data ?? []).filter((t) => !t.archived && !t.deleted_at)
      const zoneMap = Object.fromEntries((zones.data ?? []).map((z) => [z.id, z.code]))
      const perZone = {}
      const byStatus = {}
      treeRows.forEach((t) => {
        const zc = zoneMap[t.zone_id] || '—'
        perZone[zc] = (perZone[zc] || 0) + 1
        byStatus[t.status] = (byStatus[t.status] || 0) + 1
      })

      const taskRows = tasks.data ?? []
      const items = (inv.data ?? []).map((it) => ({ ...it, stock: currentStock(it, mv.data ?? []) }))
      const low = items.filter((it) => it.min_stock != null && Number(it.min_stock) > 0 && it.stock <= it.min_stock)

      const storage = {}
      ;(batches.data ?? []).filter((b) => b.status === 'in_storage').forEach((b) => {
        storage[b.produce_type] = (storage[b.produce_type] || 0) + Number(b.quantity || 0)
      })
      const yieldByZone = {}
      ;(yields.data ?? []).forEach((y) => {
        const k = y.zone?.code || '—'
        yieldByZone[k] = (yieldByZone[k] || 0) + Number(y.quantity || 0)
      })
      const openReq = (reqs.data ?? []).filter((r) => ['requested', 'approved'].includes(r.status)).length

      setD({
        zones: zones.data ?? [],
        totalTrees: treeRows.length,
        perZone, byStatus,
        myTasks: taskRows.filter((t) => t.assigned_to === profile?.id && !['Completed', 'Cancelled'].includes(t.status)),
        tasks: {
          pending: taskRows.filter((t) => ['Pending', 'In Progress'].includes(t.status)).length,
          completed: taskRows.filter((t) => t.status === 'Completed').length,
          overdue: taskRows.filter((t) => isOverdue(t)).length,
        },
        items, low, storage, yieldByZone, openReq,
        inspections: insp.data ?? [],
        names,
      })
    })()
    return () => { on = false }
  }, [profile?.id])

  if (!d) return <Spinner />

  // "Needs attention" = anything that isn't Healthy, Diseased or Dead (those have their own tiles).
  const attention = Object.entries(d.byStatus).reduce((s, [k, v]) => (['Healthy', 'Diseased', 'Dead'].includes(k) ? s : s + v), 0)
  const maxZone = Math.max(1, ...Object.values(d.perZone))
  const maxYield = Math.max(1, ...Object.values(d.yieldByZone))

  return (
    <div>
      <PageHeader
        title={`Welcome, ${(profile?.full_name || '').split(' ')[0] || 'there'} 👋`}
        subtitle="Estate overview"
      />

      {/* Alerts */}
      {d.low.length > 0 && (
        <Banner kind="error">⚠️ <strong>{d.low.length} item{d.low.length > 1 ? 's' : ''} low on stock:</strong>{' '}
          {d.low.map((i) => i.name).join(', ')} — <Link to="/inventory" className="link">view</Link></Banner>
      )}
      {owner && d.openReq > 0 && (
        <Banner kind="info">🧾 {d.openReq} inventory request{d.openReq > 1 ? 's' : ''} awaiting action — <Link to="/requests" className="link">review</Link></Banner>
      )}

      {/* Orchard */}
      <h2 className="dash-section">🌳 Orchard</h2>
      <div className="stat-grid">
        <Stat to="/orchard" icon="🌳" value={d.totalTrees} label="Trees registered" />
        <Stat to="/orchard" icon="✅" value={d.byStatus.Healthy || 0} label="Healthy" />
        <Stat to="/trees?status=Needs Attention" icon="⚠️" value={attention} label="Needs attention" tone={attention ? 'warn' : null} />
        <Stat to="/trees?status=Diseased" icon="🦠" value={d.byStatus.Diseased || 0} label="Diseased" tone={d.byStatus.Diseased ? 'warn' : null} />
        <Stat to="/trees?status=Dead" icon="🪦" value={d.byStatus.Dead || 0} label="Dead" tone={d.byStatus.Dead ? 'warn' : null} />
      </div>

      {/* Tasks */}
      <h2 className="dash-section">✅ Tasks</h2>
      <div className="stat-grid">
        <Stat to="/tasks" icon="📋" value={d.tasks.pending} label="Tasks open" />
        <Stat to="/tasks" icon="⏰" value={d.tasks.overdue} label="Overdue" tone={d.tasks.overdue ? 'warn' : null} />
        <Stat to="/tasks" icon="✔️" value={d.tasks.completed} label="Tasks completed" />
      </div>

      {/* Inventory & produce */}
      <h2 className="dash-section">📦 Inventory &amp; produce</h2>
      <div className="stat-grid">
        <Stat to="/inventory" icon="📦" value={d.items.length} label="Inventory items" />
        <Stat to="/inventory" icon="⚠️" value={d.low.length} label="Low on stock" tone={d.low.length ? 'warn' : null} />
        <Stat to="/produce" icon="🧺" value={Object.values(d.storage).reduce((s, n) => s + n, 0)} label="In storage" />
      </div>

      {/* Insights */}
      <h2 className="dash-section">📊 Insights</h2>
      <div className="dash-cols">
        {/* Trees per zone */}
        <Card>
          <div className="card-head"><h2>Trees by zone</h2><Link to="/orchard" className="link">Orchard</Link></div>
          {Object.keys(d.perZone).length === 0 ? <p className="muted">No trees registered yet.</p> :
            Object.entries(d.perZone).sort().map(([z, n]) => (
              <div key={z} className="bar-row">
                <span className="bar-label">Zone {z}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / maxZone) * 100}%`, background: '#4d7a32' }} /></div>
                <span className="bar-value">{n}</span>
              </div>
            ))}
        </Card>

        {/* Tree health mix */}
        <Card>
          <h2>Tree health</h2>
          {Object.keys(d.byStatus).length === 0 ? <p className="muted">—</p> :
            Object.entries(d.byStatus).map(([s, n]) => (
              <div key={s} className="bar-row">
                <span className="bar-label"><Badge color={STATUS_COLORS[s]}>{s}</Badge></span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / Math.max(1, d.totalTrees)) * 100}%`, background: STATUS_COLORS[s] }} /></div>
                <span className="bar-value">{n}</span>
              </div>
            ))}
        </Card>
      </div>

      <div className="dash-cols">
        {/* Yield by zone */}
        <Card>
          <div className="card-head"><h2>Yield by zone</h2><Link to="/produce" className="link">Yield</Link></div>
          {Object.keys(d.yieldByZone).length === 0 ? <p className="muted">No harvests recorded yet.</p> :
            Object.entries(d.yieldByZone).sort((a, b) => b[1] - a[1]).map(([z, n]) => (
              <div key={z} className="bar-row">
                <span className="bar-label">Zone {z}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / maxYield) * 100}%`, background: '#b5392b' }} /></div>
                <span className="bar-value">{n}</span>
              </div>
            ))}
          {Object.keys(d.storage).length > 0 && (
            <p className="muted small" style={{ marginTop: 8 }}>
              In storage: {Object.entries(d.storage).map(([t, n]) => `${n} ${t}`).join(' · ')}
            </p>
          )}
        </Card>

        {/* My tasks / recent inspections */}
        {!owner ? (
          <Card>
            <div className="card-head"><h2>Your open tasks</h2><Link to="/tasks" className="link">All</Link></div>
            {d.myTasks.length === 0 ? <p className="muted">Nothing outstanding 🎉</p> : (
              <ul className="list">
                {d.myTasks.slice(0, 6).map((t) => (
                  <li key={t.id}><Link to={`/tasks/${t.id}`} className="list-row">
                    <span className="list-title">{t.title}</span>
                    {isOverdue(t) ? <Badge color="#b5392b">Overdue</Badge> : <Badge color="#1565c0">{t.status}</Badge>}
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card>
            <div className="card-head"><h2>Recent inspections</h2><Link to="/trees" className="link">Trees</Link></div>
            {d.inspections.length === 0 ? <p className="muted">No inspections yet.</p> : (
              <ul className="list">
                {d.inspections.map((i, idx) => (
                  <li key={idx} className="list-row">
                    <div>
                      <span className="list-title mono">{i.tree?.code || 'Tree'}</span>
                      <span className="muted small"> · {i.status}</span>
                    </div>
                    <span className="muted small">{nameOf(d.names, i.inspector_id)} · {i.inspection_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function Stat({ to, icon, value, label, tone }) {
  return (
    <Link to={to} className={`stat-card ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </Link>
  )
}
