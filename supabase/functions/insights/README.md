# AI features — setup

The owner-only **AI Insights** (recommendations) and **Ask AI** (chat) features
are powered by Google Gemini. There are **two small Edge Functions**:

| Function   | Powers            | Request                 |
|------------|-------------------|-------------------------|
| `insights` | the Insights page | `{ summary }`           |
| `chat`     | the Ask AI chat   | `{ messages, summary }` |

Both share the **same project secrets**, so the key is only set once:

- `GEMINI_API_KEY` (required) — a free key from **https://aistudio.google.com/apikey**
- `GEMINI_MODEL` (optional) — defaults to `gemini-3.6-flash`

## Deploying a function (phone-friendly)
Creating a function starts you in a near-empty editor, so there's nothing to
select-all-and-delete — you just paste:

1. Supabase dashboard → **Edge Functions** → **Deploy a new function** (or **Create function**).
2. Name it exactly `insights` (or `chat`).
3. Paste the whole contents of that function's `index.ts`. Easiest to copy from the **raw** view, e.g.
   `https://raw.githubusercontent.com/faizalmakda/AvricoEstates/<branch>/supabase/functions/chat/index.ts`
4. **Deploy.**

The secret is shared, so a newly-created `chat` function works immediately with
the key you already set for `insights` — no need to add it again.

## Notes
- Only active **owners** can call either function (checked server-side).
- Free-tier rate limits apply; the app shows a friendly "try again later" message.
- On Google's free tier, inputs may be used to improve their models. Switch to a
  paid key later to avoid that — no code change, just replace the secret.
