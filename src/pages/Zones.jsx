import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { PageHeader, Spinner, Card, Badge, EmptyState } from '../components/ui'
import { STATUS_COLORS } from '../lib/permissions'

export default function Zones() {
  const [zones, setZones] = useState([])
  const [trees, setTrees] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [{ data: z }, { data: t }] = await Promise.all([
        supabase.from('zones').select('*').order('code'),
        supabase
          .from('trees')
          .select('id,zone_id,status,archived,deleted_at')
          .eq('archived', false),
      ])
      setZones(z ?? [])
      setTrees((t ?? []).filter((x) => !x.deleted_at))
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  const totalPlanned = zones.reduce((s, z) => s + (z.planned_tree_count || 0), 0)
  const totalRegistered = trees.length

  return (
    <div>
      <PageHeader
        title="Orchard"
        subtitle={`${zones.length} zones · ${totalRegistered} of ${totalPlanned} trees registered`}
      />

      {zones.length === 0 ? (
        <EmptyState icon="🗺️" title="No zones yet">
          Run <code>schema_v2.sql</code> in Supabase to set up your orchard blocks.
        </EmptyState>
      ) : (
        <div className="zone-grid">
          {zones.map((z) => {
            const inZone = trees.filter((t) => t.zone_id === z.id)
            const byStatus = {}
            inZone.forEach((t) => { byStatus[t.status] = (byStatus[t.status] || 0) + 1 })
            const attention = inZone.filter((t) =>
              ['Dead', 'Diseased', 'Weak', 'Needs Inspection', 'Missing'].includes(t.status)
            ).length
            const pct = z.planned_tree_count
              ? Math.round((inZone.length / z.planned_tree_count) * 100)
              : 0
            return (
              <Card key={z.id} className="zone-card">
                <div className="zone-card-head">
                  <Link to={`/trees?zone=${z.code}`} className="zone-code-link">
                    <span className="zone-code">{z.code}</span>
                  </Link>
                  {attention > 0 && <Badge color="#ef6c00">{attention} need attention</Badge>}
                </div>
                <div className="zone-count">
                  <strong>{inZone.length}</strong>
                  <span className="muted"> / {z.planned_tree_count || '—'} trees registered</span>
                </div>
                <div className="bar-track" style={{ margin: '8px 0' }}>
                  <div className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: '#2e7d32' }} />
                </div>
                {inZone.length > 0 ? (
                  <div className="status-chips">
                    {Object.entries(byStatus).map(([s, n]) => (
                      <span key={s} className="status-chip" style={{ borderColor: STATUS_COLORS[s] }}>
                        <span className="dot" style={{ background: STATUS_COLORS[s] }} />
                        {s} {n}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">No trees registered yet.</p>
                )}
                <Link to={`/trees?zone=${z.code}`} className="link" style={{ marginTop: 8, display: 'inline-block' }}>
                  Open register →
                </Link>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
