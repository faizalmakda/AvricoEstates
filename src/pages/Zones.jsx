import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { can, STATUS_COLORS } from '../lib/permissions'
import { Card, PageHeader, Spinner, Badge, EmptyState, Button, Modal, Field } from '../components/ui'

export default function Zones() {
  const { profile } = useAuth()
  const manage = can.manageZones(profile)
  const [zones, setZones] = useState([])
  const [trees, setTrees] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // 'new' | zone

  const load = async () => {
    setLoading(true)
    const [{ data: z }, { data: t }] = await Promise.all([
      supabase.from('zones').select('*').order('code'),
      supabase.from('trees').select('id,zone_id,status,archived,deleted_at').eq('archived', false),
    ])
    setZones(z ?? [])
    setTrees((t ?? []).filter((x) => !x.deleted_at))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  if (loading) return <Spinner />

  const totalPlanned = zones.reduce((s, z) => s + (z.planned_tree_count || 0), 0)
  const totalRegistered = trees.length

  return (
    <div>
      <PageHeader
        title="Orchard"
        subtitle={`${zones.length} zones · ${totalRegistered} of ${totalPlanned} trees registered`}
        action={manage && <Button onClick={() => setEditing('new')}>+ Add zone</Button>}
      />

      {zones.length === 0 ? (
        <EmptyState icon="🗺️" title="No zones yet">
          {manage ? 'Add your first zone to start mapping the orchard.' : 'No zones set up yet.'}
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
            const pct = z.planned_tree_count ? Math.round((inZone.length / z.planned_tree_count) * 100) : 0
            return (
              <Card key={z.id} className="zone-card">
                <div className="zone-card-head">
                  <Link to={`/trees?zone=${z.code}`} className="zone-code-link"><span className="zone-code">{z.code}</span></Link>
                  {attention > 0 && <Badge color="#ef6c00">{attention} need attention</Badge>}
                </div>
                {z.name && z.name !== `Zone ${z.code}` && <div className="muted small">{z.name}</div>}
                <div className="zone-count">
                  <strong>{inZone.length}</strong>
                  <span className="muted"> / {z.planned_tree_count || '—'} trees registered</span>
                </div>
                <div className="bar-track" style={{ margin: '8px 0' }}>
                  <div className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: '#4d7a32' }} />
                </div>
                {inZone.length > 0 ? (
                  <div className="status-chips">
                    {Object.entries(byStatus).map(([s, n]) => (
                      <span key={s} className="status-chip" style={{ borderColor: STATUS_COLORS[s] }}>
                        <span className="dot" style={{ background: STATUS_COLORS[s] }} />{s} {n}
                      </span>
                    ))}
                  </div>
                ) : <p className="muted small">No trees registered yet.</p>}
                <div className="zone-actions">
                  <Link to={`/trees?zone=${z.code}`} className="link">Open trees →</Link>
                  {manage && <button className="link" onClick={() => setEditing(z)}>Edit</button>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <ZoneModal
          zone={editing === 'new' ? null : editing}
          existing={zones}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function ZoneModal({ zone, existing, onClose, onSaved }) {
  const [form, setForm] = useState(
    zone || { code: '', name: '', planned_tree_count: 0, area_ha: '' }
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    const code = (form.code || '').trim().toUpperCase()
    if (!code) return setError('Enter a zone code (e.g. A1, C1).')
    if (!zone && existing.some((z) => z.code === code)) return setError(`Zone "${code}" already exists.`)
    setBusy(true); setError(null)
    const payload = {
      code,
      name: form.name?.trim() || `Zone ${code}`,
      planned_tree_count: parseInt(form.planned_tree_count, 10) || 0,
      area_ha: form.area_ha === '' || form.area_ha == null ? null : Number(form.area_ha),
    }
    const { error } = zone
      ? await supabase.from('zones').update(payload).eq('id', zone.id)
      : await supabase.from('zones').insert(payload)
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal title={zone ? `Edit zone ${zone.code}` : 'Add zone'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="row">
          <Field label="Zone code" hint={zone ? undefined : 'e.g. A1, B2, C1'}>
            <input value={form.code} onChange={set('code')} disabled={!!zone} required />
          </Field>
          <Field label="Planned trees">
            <input type="number" min="0" value={form.planned_tree_count} onChange={set('planned_tree_count')} />
          </Field>
        </div>
        <Field label="Name (optional)"><input value={form.name || ''} onChange={set('name')} placeholder={`Zone ${form.code || ''}`} /></Field>
        <Field label="Area in hectares (optional)"><input type="number" step="any" value={form.area_ha ?? ''} onChange={set('area_ha')} /></Field>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : zone ? 'Save changes' : 'Add zone'}</Button>
        </div>
      </form>
    </Modal>
  )
}
