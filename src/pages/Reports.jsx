import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { STATUS_COLORS } from '../lib/permissions'
import { isOverdue } from './Tasks'
import { Card, PageHeader, Spinner, Badge } from '../components/ui'

function currentStock(item, movements) {
  return Number(item.quantity || 0) + movements
    .filter((m) => m.item_id === item.id)
    .reduce((s, m) => s + (m.movement_type === 'out' ? -Number(m.quantity || 0)
      : (m.movement_type === 'in' || m.movement_type === 'adjust') ? Number(m.quantity || 0) : 0), 0)
}

export default function Reports() {
  const [d, setD] = useState(null)

  useEffect(() => {
    ;(async () => {
      const [zones, trees, tasks, yields, inv, mv, batches] = await Promise.all([
        supabase.from('zones').select('id,code').order('code'),
        supabase.from('trees').select('status,zone_id,archived,deleted_at'),
        supabase.from('tasks').select('status,due_date'),
        supabase.from('yield_records').select('quantity,harvest_date,zone_id, zone:zone_id(code)'),
        supabase.from('inventory').select('id,name,quantity,min_stock,unit'),
        supabase.from('stock_movements').select('item_id,movement_type,quantity'),
        supabase.from('produce_batches').select('produce_type,quantity,status'),
      ])

      const zoneCodes = (zones.data ?? []).map((z) => z.code)
      const zoneMap = Object.fromEntries((zones.data ?? []).map((z) => [z.id, z.code]))
      const treeRows = (trees.data ?? []).filter((t) => !t.archived && !t.deleted_at)

      // trees & attention by zone
      const perZone = {}, deadByZone = {}, attentionByZone = {}, byStatus = {}
      zoneCodes.forEach((c) => { perZone[c] = 0; deadByZone[c] = 0; attentionByZone[c] = 0 })
      treeRows.forEach((t) => {
        const z = zoneMap[t.zone_id]
        if (z != null) {
          perZone[z] = (perZone[z] || 0) + 1
          if (t.status === 'Dead') deadByZone[z]++
          else if (t.status !== 'Healthy') attentionByZone[z]++
        }
        byStatus[t.status] = (byStatus[t.status] || 0) + 1
      })

      const taskRows = tasks.data ?? []
      const taskCounts = ['Pending', 'In Progress', 'Completed', 'Cancelled'].reduce((o, s) => {
        o[s] = taskRows.filter((t) => t.status === s).length; return o
      }, {})
      taskCounts.Overdue = taskRows.filter((t) => isOverdue(t)).length
      const completionRate = taskRows.length ? Math.round((taskCounts.Completed / taskRows.length) * 100) : 0

      const yieldByZone = {}, yieldByMonth = {}
      ;(yields.data ?? []).forEach((y) => {
        const z = y.zone?.code || '—'
        yieldByZone[z] = (yieldByZone[z] || 0) + Number(y.quantity || 0)
        const m = (y.harvest_date || '').slice(0, 7)
        if (m) yieldByMonth[m] = (yieldByMonth[m] || 0) + Number(y.quantity || 0)
      })

      const items = (inv.data ?? []).map((it) => ({ ...it, stock: currentStock(it, mv.data ?? []) }))
      const low = items.filter((it) => it.min_stock != null && Number(it.min_stock) > 0 && it.stock <= it.min_stock)
      const storage = {}
      ;(batches.data ?? []).filter((b) => b.status === 'in_storage').forEach((b) => {
        storage[b.produce_type] = (storage[b.produce_type] || 0) + Number(b.quantity || 0)
      })

      setD({
        treeTotal: treeRows.length, perZone, deadByZone, attentionByZone, byStatus,
        taskCounts, completionRate, taskTotal: taskRows.length,
        yieldByZone, yieldByMonth, yieldTotal: Object.values(yieldByZone).reduce((s, n) => s + n, 0),
        items, low, storage,
      })
    })()
  }, [])

  if (!d) return <Spinner />

  const maxStatus = Math.max(1, ...Object.values(d.byStatus))
  const months = Object.keys(d.yieldByMonth).sort().slice(-6)
  const maxMonth = Math.max(1, ...months.map((m) => d.yieldByMonth[m]))
  const maxYieldZone = Math.max(1, ...Object.values(d.yieldByZone))

  return (
    <div>
      <PageHeader title="Reports" subtitle="Estate insights" />

      <div className="stat-grid">
        <SmallStat value={d.treeTotal} label="Active trees" />
        <SmallStat value={`${d.completionRate}%`} label="Task completion" />
        <SmallStat value={d.yieldTotal} label="Total yield" />
        <SmallStat value={d.low.length} label="Items low on stock" />
      </div>

      <div className="dash-cols">
        <Card>
          <h2>Trees per zone</h2>
          <BarList data={d.perZone} color="#4d7a32" />
        </Card>
        <Card>
          <h2>Tree health</h2>
          {Object.entries(d.byStatus).map(([s, n]) => (
            <div key={s} className="bar-row">
              <span className="bar-label"><Badge color={STATUS_COLORS[s]}>{s}</Badge></span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / maxStatus) * 100}%`, background: STATUS_COLORS[s] }} /></div>
              <span className="bar-value">{n}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="dash-cols">
        <Card>
          <h2>Dead trees by zone</h2>
          <BarList data={d.deadByZone} color={STATUS_COLORS.Dead} empty="No dead trees recorded." />
        </Card>
        <Card>
          <h2>Needs attention by zone</h2>
          <BarList data={d.attentionByZone} color={STATUS_COLORS['Needs Attention']} empty="None recorded." />
        </Card>
      </div>

      <div className="dash-cols">
        <Card>
          <h2>Yield by zone</h2>
          <BarList data={d.yieldByZone} color="#b5392b" sort empty="No harvests yet." />
        </Card>
        <Card>
          <h2>Tasks</h2>
          {Object.entries(d.taskCounts).map(([s, n]) => (
            <div key={s} className="bar-row">
              <span className="bar-label">{s}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / Math.max(1, d.taskTotal)) * 100}%`, background: s === 'Completed' ? '#2e7d32' : s === 'Overdue' ? '#b5392b' : '#1565c0' }} /></div>
              <span className="bar-value">{n}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <h2>Yield — last 6 months</h2>
        {months.length === 0 ? <p className="muted">No harvests recorded yet.</p> : (
          <div className="chart">
            {months.map((m) => (
              <div key={m} className="chart-col">
                <div className="chart-bar" style={{ height: `${(d.yieldByMonth[m] / maxMonth) * 140 + 4}px` }} />
                <div className="chart-value">{d.yieldByMonth[m]}</div>
                <div className="chart-label">{m}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="dash-cols">
        <Card>
          <h2>Inventory levels</h2>
          {d.items.length === 0 ? <p className="muted">No items.</p> : (
            <ul className="list">
              {d.items.map((it) => {
                const lowItem = it.min_stock != null && Number(it.min_stock) > 0 && it.stock <= it.min_stock
                return (
                  <li key={it.id} className="list-row">
                    <span className="list-title">{it.name}</span>
                    <span>{it.stock} {it.unit || ''} {lowItem && <Badge color="#b5392b">Low</Badge>}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <Card>
          <h2>Produce in storage</h2>
          {Object.keys(d.storage).length === 0 ? <p className="muted">Nothing in storage.</p> : (
            <ul className="list">
              {Object.entries(d.storage).map(([t, n]) => (
                <li key={t} className="list-row"><span className="list-title">{t}</span><strong>{n}</strong></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function BarList({ data, color, sort, empty }) {
  let entries = Object.entries(data)
  if (sort) entries = entries.sort((a, b) => b[1] - a[1])
  else entries = entries.sort()
  const max = Math.max(1, ...entries.map(([, n]) => n))
  if (entries.length === 0 || entries.every(([, n]) => n === 0)) return <p className="muted">{empty || 'No data.'}</p>
  return entries.map(([k, n]) => (
    <div key={k} className="bar-row">
      <span className="bar-label">Zone {k}</span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / max) * 100}%`, background: color }} /></div>
      <span className="bar-value">{n}</span>
    </div>
  ))
}

function SmallStat({ value, label }) {
  return <div className="stat-card"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
}
