import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fetchNameMap, nameOf } from '../lib/people'
import { Card, PageHeader, Spinner, Badge, EmptyState, Banner } from '../components/ui'

const TABLE_LABEL = {
  inventory: 'Inventory item',
  stock_movements: 'Stock movement',
  yield_records: 'Harvest',
  produce_batches: 'Storage batch',
  produce_movements: 'Produce sent out',
}
const ACTION_COLOR = { INSERT: '#2e7d32', UPDATE: '#1565c0', DELETE: '#b5392b' }
const ACTION_VERB = { INSERT: 'Added', UPDATE: 'Edited', DELETE: 'Deleted' }

// Fields that are noise in a change log.
const HIDE = new Set(['id', 'created_at', 'updated_at', 'updated_by', 'created_by', 'recorded_by', 'performed_by', 'zone_id', 'storage_location_id', 'item_id', 'yield_id', 'batch_id', 'tree_id', 'deleted_at'])
// Friendlier labels for the fields people care about.
const FIELD_LABEL = {
  quantity: 'Qty', unit: 'Unit', produce_type: 'Produce', grade: 'Grade', status: 'Status',
  item_name: 'Item', name: 'Name', min_stock: 'Min stock', reason: 'Reason',
  destination: 'Destination', movement_type: 'Type', estimated_cost: 'Est. cost',
  purchased_quantity: 'Purchased qty', harvest_date: 'Date', location: 'Location', notes: 'Notes',
}
const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v))
const label = (k) => FIELD_LABEL[k] || k

// Identify a record in a human way (for inserts/deletes).
function summary(row) {
  if (!row) return ''
  const bits = [row.produce_type, row.item_name || row.name, row.movement_type,
    row.quantity != null ? `${row.quantity} ${row.unit || ''}`.trim() : null].filter(Boolean)
  return bits.slice(0, 2).join(' · ')
}

// What changed between old and new (for updates).
function changes(oldD, newD) {
  if (!oldD || !newD) return []
  const keys = new Set([...Object.keys(oldD), ...Object.keys(newD)])
  const out = []
  keys.forEach((k) => {
    if (HIDE.has(k)) return
    if (String(oldD[k] ?? '') !== String(newD[k] ?? '')) out.push({ k, from: oldD[k], to: newD[k] })
  })
  return out
}

export default function Activity() {
  const [rows, setRows] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [table, setTable] = useState('')
  const [action, setAction] = useState('')

  useEffect(() => {
    ;(async () => {
      const [{ data, error }, nm] = await Promise.all([
        supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(200),
        fetchNameMap(),
      ])
      setMissing(Boolean(error))
      setRows(data ?? [])
      setNames(nm)
      setLoading(false)
    })()
  }, [])

  const visible = useMemo(() => rows.filter((r) =>
    (!table || r.table_name === table) && (!action || r.action === action)
  ), [rows, table, action])

  return (
    <div>
      <PageHeader title="Activity log" subtitle="Every stock & harvest change — who, when, and what" />

      {!loading && missing && (
        <Banner kind="info">⚙️ Run <code>supabase/schema_v12_audit.sql</code> in Supabase to start recording the activity log.</Banner>
      )}

      <div className="toolbar">
        <select value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">All areas</option>
          {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All changes</option>
          <option value="INSERT">Added</option>
          <option value="UPDATE">Edited</option>
          <option value="DELETE">Deleted</option>
        </select>
      </div>

      {loading ? <Spinner /> : visible.length === 0 ? (
        <EmptyState icon="📜" title="Nothing logged yet">Changes to stock and harvests will appear here.</EmptyState>
      ) : (
        <Card>
          <ul className="timeline">
            {visible.map((r) => {
              const diff = changes(r.old_data, r.new_data)
              const row = r.new_data || r.old_data
              return (
                <li key={r.id}>
                  <div className="timeline-dot" style={{ background: ACTION_COLOR[r.action] }} />
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <strong>
                        <Badge color={ACTION_COLOR[r.action]}>{ACTION_VERB[r.action] || r.action}</Badge>
                        &nbsp;{TABLE_LABEL[r.table_name] || r.table_name}
                        {summary(row) ? ` — ${summary(row)}` : ''}
                      </strong>
                      <span className="muted small">{nameOf(names, r.changed_by)} · {new Date(r.changed_at).toLocaleString()}</span>
                    </div>
                    {r.action === 'UPDATE' && (
                      diff.length === 0 ? <p className="muted small">No visible field changes.</p> : (
                        <ul className="diff-list">
                          {diff.map((c) => (
                            <li key={c.k} className="small">
                              <span className="muted">{label(c.k)}:</span> {fmt(c.from)} <span className="muted">→</span> <strong>{fmt(c.to)}</strong>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
