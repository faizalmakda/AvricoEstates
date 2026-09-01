import { supabase } from '../supabaseClient'
import { cachedSelectAll } from './cache'

const needsAttention = (s) => s !== 'Healthy' && s !== 'Dead'

// Build a small snapshot of the farm's data for the AI (insights and chat).
// Deliberately compact — aggregates and a few specifics, not every row.
export async function buildSummary() {
  const [zonesRes, treesRes, tasksRes, invRes] = await Promise.all([
    supabase.from('zones').select('id,code,planned_tree_count').order('code'),
    cachedSelectAll('insights-trees', (from, to) =>
      supabase.from('trees').select('zone_id,status,last_inspection_on,archived,deleted_at').order('id').range(from, to)),
    supabase.from('tasks').select('status,due_date'),
    supabase.from('inventory').select('name,quantity,min_stock,unit'),
  ])

  const zones = zonesRes.data ?? []
  const trees = (treesRes.data ?? []).filter((t) => !t.archived && !t.deleted_at)
  const tasks = tasksRes.data ?? []
  const inv = invRes.data ?? []

  const byStatus = {}
  const zmap = Object.fromEntries(zones.map((z) => [z.id,
    { code: z.code, planned: z.planned_tree_count || 0, registered: 0, healthy: 0, dead: 0, needs_attention: 0 }]))
  for (const t of trees) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1
    const z = zmap[t.zone_id]
    if (!z) continue
    z.registered++
    if (t.status === 'Healthy') z.healthy++
    else if (t.status === 'Dead') z.dead++
    if (needsAttention(t.status)) z.needs_attention++
  }

  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const total = trees.length
  const healthy = byStatus.Healthy || 0
  const done = (s) => ['Completed', 'Cancelled'].includes(s)

  return {
    crop: 'avocado',
    estate: {
      total_registered: total,
      total_planned: zones.reduce((s, z) => s + (z.planned_tree_count || 0), 0),
      healthy, dead: byStatus.Dead || 0,
      needs_attention: trees.filter((t) => needsAttention(t.status)).length,
      healthy_pct: total ? Math.round((healthy / total) * 100) : 0,
      by_status: byStatus,
    },
    zones: Object.values(zmap),
    inspections: {
      needs_attention_not_inspected_30d:
        trees.filter((t) => needsAttention(t.status) && (!t.last_inspection_on || t.last_inspection_on < cutoff)).length,
    },
    tasks: {
      open: tasks.filter((t) => !done(t.status)).length,
      overdue: tasks.filter((t) => t.due_date && t.due_date < today && !done(t.status)).length,
    },
    inventory_low: inv
      .filter((i) => i.min_stock && Number(i.quantity) <= Number(i.min_stock))
      .map((i) => ({ name: i.name, quantity: i.quantity, min_stock: i.min_stock, unit: i.unit })),
  }
}
