# Setup guide — Avrico Estates

This takes about 15 minutes and needs **no coding**. You'll end up with a real
app you open on any phone, with logins for your 3 directors and your farm
manager.

There are two free accounts involved:
- **Supabase** — the cloud database (holds logins, trees, tasks, photos).
- **GitHub** — hosts the app itself (you likely already have this).

---

## Step 1 — Create the database (Supabase)

1. Go to **https://supabase.com** and sign up (free).
2. Click **New project**. Give it a name (e.g. "Avrico Estates"), choose a
   region near you, and set a database password (save it somewhere).
3. Wait ~2 minutes for it to finish setting up.

### Run the setup script
4. In the left menu, open **SQL Editor** → **New query**.
5. Open the file **`supabase/schema.sql`** from this project, copy **everything**,
   paste it into the editor, and click **Run**.
   - You should see "Success". This creates all the tables and the security
     rules that keep the farm manager limited to adding (not deleting) records.

### Get your two keys
6. In the left menu open **Project Settings** (gear icon) → **API**.
7. Copy these two values — you'll need them in Step 2:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string)

> These are safe to put in a website — your data is protected by the security
> rules from Step 1, not by hiding this key.

---

## Step 2 — Publish the app (GitHub Pages)

1. In your GitHub repository, go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** and add these two (names must match exactly):
   - `VITE_SUPABASE_URL` → paste the Project URL
   - `VITE_SUPABASE_ANON_KEY` → paste the anon public key
3. Go to **Settings → Pages**. Under **Build and deployment → Source**, choose
   **GitHub Actions**.
4. Go to the **Actions** tab. The "Deploy to GitHub Pages" workflow runs
   automatically (you can also click **Run workflow**). When it finishes (green
   tick), your app is live.
5. Your app URL appears under **Settings → Pages** — something like
   `https://YOUR-USERNAME.github.io/AvricoEstates/`.

> Tip: open that link on your phone, then use your browser's **"Add to Home
> Screen"** to install it like a normal app.

---

## Step 3 — Create your logins

You need 4 logins: 3 directors (owners) + 1 farm manager.

### The first owner (do this once, by hand)
1. In Supabase, go to **Authentication → Users → Add user → Create new user**.
2. Enter the email and a password for the **first director**. Tick
   **Auto Confirm User** so they can log in right away. Click **Create user**.
3. Make that person an **owner**: open **SQL Editor → New query**, paste the
   line below (with their real email), and **Run**:
   ```sql
   update public.profiles set role = 'owner'
   where id = (select id from auth.users where email = 'director1@example.com');
   ```

### Everyone else (from inside the app)
4. Open your live app, sign in as the first director.
5. Go to **Users** (in the menu). Click **+ Add user** to create the other 2
   directors (set their access to **Owner / Admin**) and the farm manager (set
   access to **Farm Manager**).

> The in-app "Add user" button uses a secure helper called an **Edge Function**.
> If you'd like that button to work, deploy it once (see the optional step
> below). If you skip it, just add each person via **Authentication → Add user**
> in Supabase, then set their access level on the **Users** page in the app.

---

## Optional — enable in-app "Add user"

This lets owners create logins from the app instead of the Supabase dashboard.

1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
2. In a terminal:
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase functions deploy create-user
   ```
   (`YOUR-PROJECT-REF` is the part before `.supabase.co` in your Project URL.)

That's it — the **+ Add user** button now works for owners.

---

## You're done 🎉
- 3 directors can all log in at once with full access.
- The farm manager logs in and only sees his tasks and tree logging.
- Every change the manager makes is added as a new entry — nothing is ever
  overwritten or deleted.

### Troubleshooting
- **"Almost there — one setup step left" screen:** the two GitHub secrets are
  missing or misspelled. Recheck Step 2, then re-run the Actions workflow.
- **Can't log in:** make sure the user was created with **Auto Confirm User**
  ticked (or confirm them in Authentication → Users).
- **Manager sees no tasks:** tasks only appear for the person they're
  **assigned to**. Assign a task to him from an owner account.
