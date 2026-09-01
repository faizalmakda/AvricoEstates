// Shared, friendly wording for AI (Gemini) errors — used by both the Insights
// generator and the chat assistant.

// Turn a rate-limit into a plain "try again later" message with timing.
export function rateLimitMessage(seconds) {
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
export function friendlyError(raw) {
  const s = String(raw || '')
  if (/\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(s)) {
    const m = s.match(/retryDelay"?\s*:?\s*"?(\d+)s/i)
    return rateLimitMessage(m ? Number(m[1]) : null)
  }
  return s || 'Something went wrong. Please try again.'
}
