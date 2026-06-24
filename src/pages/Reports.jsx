import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { TREE_STATUSES, STATUS_COLORS } from '../lib/permissions'
import { Card, PageHeader, Spinner, Badge } from '../components/ui'

// Owner-only reporting view: tree health breakdown, task completion, yield by month.
export default function Reports() {
  const [data, setData] = useState(null)

  useEffect(() => {
    ;(async () => {
      const [trees, tasks, produce, submissions] = await Promise.all([
        supabase.from('trees').select('status,archived'),
        supabase.from('tasks').select('status'),
        supabase.from('produce').select('quantity,unit,harvested_on,crop'),
        supabase.from('task_submissions').select('id,created_at'),
      ])

      const treeRows = (trees.data ?? []).filter((t) => !t.archived)
      const byStatus = Object.fromEntries(TREE_STATUSES.map((s) => [s, 0]))
      treeRows.forEach((t) => { byStatus[t.status] = (byStatus[t.status] || 0) + 1 })

      const taskRows = tasks.data ?? []
      const taskCounts = {
        Open: taskRows.filter((t) => t.status === 'Open').length,
        'In Progress': taskRows.filter((t) => t.status === 'In Progress').length,
        Completed: taskRows.filter((t) => t.status === 'Completed').length,
      }

      const yieldByMonth = {}
      ;(produce.data ?? []).forEach((p) => {
        const key = (p.harvested_on || '').slice(0, 7)
        yieldByMonth[key] = (yieldByMonth[key] || 0) + Number(p.quantity || 0)
      })

      setData({
        treeTotal: treeRows.length,
        byStatus,
        taskCounts,
        taskTotal: taskRows.length,
        yieldByMonth,
        yieldTotal: (produce.data ?? []).reduce((s, p) => s + Number(p.quantity || 0), 0),
        submissions: (submissions.data ?? []).length,
      })
    })()
  }, [])

  if (!data) return <Spinner />

  const maxStatus = Math.max(1, ...Object.values(data.byStatus))
  const months = Object.keys(data.yieldByMonth).sort().slice(-6)
  const maxMonth = Math.max(1, ...months.map((m) => data.yieldByMonth[m]))

  return (
    <div>
      <PageHeader title="Reports" subtitle="Estate insights" />

      <div className="stat-grid">
        <SmallStat value={data.treeTotal} label="Active trees" />
        <SmallStat value={data.taskCounts.Completed} label="Tasks completed" />
        <SmallStat value={data.submissions} label="Evidence submissions" />
        <SmallStat value={data.yieldTotal} label="Total yield" />
      </div>

      <div className="dash-cols">
        <Card>
          <h2>Tree health</h2>
          {Object.entries(data.byStatus).map(([status, n]) => (
            <div key={status} className="bar-row">
              <span className="bar-label">
                <Badge color={STATUS_COLORS[status]}>{status}</Badge>
              </span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${(n / maxStatus) * 100}%`, background: STATUS_COLORS[status] }}
                />
              </div>
              <span className="bar-value">{n}</span>
            </div>
          ))}
        </Card>

        <Card>
          <h2>Tasks</h2>
          {Object.entries(data.taskCounts).map(([status, n]) => (
            <div key={status} className="bar-row">
              <span className="bar-label">{status}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${(n / Math.max(1, data.taskTotal)) * 100}%`,
                    background: status === 'Completed' ? '#2e7d32' : '#1565c0',
                  }}
                />
              </div>
              <span className="bar-value">{n}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <h2>Yield — last 6 months</h2>
        {months.length === 0 ? (
          <p className="muted">No harvests recorded yet.</p>
        ) : (
          <div className="chart">
            {months.map((m) => (
              <div key={m} className="chart-col">
                <div
                  className="chart-bar"
                  style={{ height: `${(data.yieldByMonth[m] / maxMonth) * 140 + 4}px` }}
                  title={`${data.yieldByMonth[m]}`}
                />
                <div className="chart-value">{data.yieldByMonth[m]}</div>
                <div className="chart-label">{m}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function SmallStat({ value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
