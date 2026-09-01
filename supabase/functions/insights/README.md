# Farm Insights — setup (one-time)

The **Insights** page (owner-only) asks Google Gemini for recommendations based
on your farm data. The AI key lives here on the server, never in the app.

This uses **Google Gemini's free tier** — no credit card, no cost within its
limits.

## 1. Get a free Google AI key (~2 minutes)
1. Go to **https://aistudio.google.com/apikey**
2. Sign in with a Google account.
3. Click **Create API key** → copy the key (starts with `AIza...`).

## 2. Deploy the function and add the key
With the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and
logged in (`supabase login`, then `supabase link` to this project):

```bash
# deploy the function
supabase functions deploy insights

# store your Google AI key as a secret (paste your real key)
supabase secrets set GEMINI_API_KEY=AIza...your_key...

# optional: pick a model (default is gemini-3.6-flash)
# supabase secrets set GEMINI_MODEL=gemini-3.6-flash
```

That's it. Open the app as an **owner** → **Insights** → **Generate insights**.

## Notes
- Only active **owners** can call it (checked server-side).
- Free-tier limits apply (a cap on requests per minute/day) — fine for pressing
  "Generate" now and then; not for bursts.
- On Google's free tier, inputs may be used to improve their models. To avoid
  that, switch to a paid key later — no code change, just replace the secret.
- To use Anthropic Claude or another provider instead, only `index.ts` changes.
