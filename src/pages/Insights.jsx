import { useState } from 'react'
import { supabase, isDemo } from '../supabaseClient'
import { cachedSelectAll } from '../lib/cache'
import { Button, Card, PageHeader, Spinner, Banner } from '../components/ui'

const CACHE_KEY = 'avrico:insights'
const needsAttention = (s) => s !== 'Healthy' && s !== 'Dead'

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null } }
const writeCache = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)) } catch { /* ignore */ } }

// Build a small summary of the farm's data to send to the AI. Deliberately
// compact — aggregates and a few specifics, not every row — to stay cheap.
async function buildSummary() {
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

const SEV = {
  critical: { label: 'Act now', cls: 'crit' },
  warning: { label: 'This week', cls: 'warn' },
  info: { label: 'Good to know', cls: 'info' },
}

// Turn a rate-limit into a plain "try again later" message with timing.
function rateLimitMessage(seconds) {
  if (seconds && seconds > 0) {
    if (seconds <= 90) return "You've hit the free AI limit for the moment — give it about a minute and try again."
    const mins = Math.ceil(seconds / 60)
    if (mins <= 90) return `You've hit the free AI limit. Try again in about ${mins} minutes.`
    const hrs = Math.round(seconds / 3600)
    return `You've hit the free AI limit. Try again in about ${hrs} hour${hrs === 1 ? '' : 's'}.`
  }
  return "You've used up the free AI allowance for now. The free daily limit resets once a day (around mid-morning Malawi time) — please try again later today or tomorrow morning."
}

// Show a friendly message for rate-limit errors; pass other errors through.
function friendlyError(raw) {
  const s = String(raw || '')
  if (/\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(s)) {
    const m = s.match(/retryDelay"?\s*:?\s*"?(\d+)s/i)
    return rateLimitMessage(m ? Number(m[1]) : null)
  }
  return s
}

const money = (n) => Number(n).toLocaleString()

export default function Insights() {
  const [result, setResult] = useState(() => readCache())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const generate = async () => {
    setBusy(true); setError(null)
    try {
      const summary = await buildSummary()
      const { data, error: fnErr } = await supabase.functions.invoke('insights', { body: { summary } })
      if (fnErr) {
        let b = null
        try { b = await fnErr.context.json() } catch { /* ignore */ }
        if (b?.rate_limited) throw new Error(rateLimitMessage(b.retry_after_seconds))
        throw new Error(b?.error || fnErr.message)
      }
      if (data?.error) throw new Error(data.error)
      const res = { recommendations: data.recommendations, generated_at: data.generated_at, summary }
      setResult(res); writeCache(res)
    } catch (e) {
      setError(friendlyError(e.message || 'Could not generate insights.'))
    } finally { setBusy(false) }
  }

  const est = result?.summary?.estate
  const when = result?.generated_at ? new Date(result.generated_at) : null

  return (
    <div>
      <PageHeader
        title="AI Insights"
        subtitle="AI-generated recommendations from your trees, inspections, tasks and stock."
      />

      {isDemo ? (
        <Banner kind="info">Insights need the live backend — they aren’t available in demo mode.</Banner>
      ) : (
        <Card className="gen-card">
          <div className="gen-row">
            <div>
              <strong>{result ? 'Insights ready' : 'No insights generated yet'}</strong>
              <div className="muted small">
                {when
                  ? `Last generated ${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Tap generate to analyse your latest farm data.'}
              </div>
            </div>
            <Button onClick={generate} disabled={busy}>
              {busy ? 'Analysing…' : result ? '✨ Regenerate' : '✨ Generate insights'}
            </Button>
          </div>
        </Card>
      )}

      {error && <Banner kind="error">{error}</Banner>}
      {busy && !result && <Spinner label="Reading your farm data…" />}

      {est && (
        <Card>
          <p className="eyebrow">Estate at a glance</p>
          <div className="insight-stats">
            <div className="istat"><div className="n mono">{money(est.total_registered)}</div><div className="l">Trees registered</div></div>
            <div className="istat"><div className="n mono">{est.healthy_pct}%</div><div className="l">Healthy</div></div>
            <div className="istat"><div className="n mono">{money(est.needs_attention)}</div><div className="l">Need attention</div></div>
            <div className="istat"><div className="n mono">{money(est.dead)}</div><div className="l">Dead</div></div>
          </div>
        </Card>
      )}

      {result?.recommendations?.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: '18px 2px 10px' }}>Recommendations · most urgent first</p>
          <div className="rec-list">
            {result.recommendations.map((r, i) => {
              const sev = SEV[r.severity] || SEV.info
              return (
                <div key={i} className={`rec rec-${sev.cls}`}>
                  <div className="rec-stripe" />
                  <div className="rec-body">
                    <div className="rec-head">
                      <span className={`rec-tag rec-tag-${sev.cls}`}>{sev.label}</span>
                      <h3>{r.title}</h3>
                    </div>
                    <p>{r.finding}</p>
                    {r.action && <p className="rec-action">→ <strong>Suggested:</strong> {r.action}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {result && (
        <p className="muted small" style={{ marginTop: 16 }}>
          Insights are suggestions to guide decisions, not instructions — always confirm on the ground.
        </p>
      )}
    </div>
  )
}
