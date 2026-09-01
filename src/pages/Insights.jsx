import { useState } from 'react'
import { supabase, isDemo } from '../supabaseClient'
import { buildSummary } from '../lib/farmSummary'
import { friendlyError, rateLimitMessage } from '../lib/aiErrors'
import FarmChat from '../components/FarmChat'
import { Button, Card, PageHeader, Spinner, Banner } from '../components/ui'

const CACHE_KEY = 'avrico:insights'
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null } }
const writeCache = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)) } catch { /* ignore */ } }

const SEV = {
  critical: { label: 'Act now', cls: 'crit' },
  warning: { label: 'This week', cls: 'warn' },
  info: { label: 'Good to know', cls: 'info' },
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

      {!isDemo && <div style={{ marginTop: 20 }}><FarmChat /></div>}
    </div>
  )
}
