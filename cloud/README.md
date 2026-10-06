# Cloud & GitHub setup (one-time, ~20 minutes)

Three free services, each with one job:

| Service | Job | Free tier |
|---|---|---|
| **GitHub** (private repo) | history + off-machine copy of everything (engine, subjects, PDFs, backup files) | yes |
| **Supabase** | accounts (sign-in), per-user sync of progress/conversations/settings, daily snapshots, private file storage (imported packs, database backups) | 500 MB DB, 1 GB files |
| **Netlify** | hosts the website built from the GitHub repo, auto-updates on every push | yes |

The website contains **only** the app and the shared subject packs (see `netlify.toml`): no PDFs, no backups, no private packs,
no database, no API keys. Your personal data lives only in your Supabase account (row-level security).
Note: anyone who has the website address can open the shared study material (not your data).

---
## 1. GitHub (private repository) — with GitHub Desktop
1. Create a free account at https://github.com (skip if you have one).
2. Install **GitHub Desktop**: https://desktop.github.com → sign in.
3. *File → Add Local Repository…* → choose `Documents/MyApps/noema-lite` (Claude already initialised it and made the first commit).
4. Click **Publish repository** → keep **“Keep this code private”** ticked → Publish.
5. From now on: when Claude has made changes, open GitHub Desktop → **Push origin**. (Claude commits; you push.)

## 2. Supabase (accounts + sync)
1. https://supabase.com → *Start your project* → sign in with GitHub → **New project** (name `noema-lite`, region *Frankfurt (eu-central-1)*, generate a DB password and store it in your password manager).
2. When ready: left menu **SQL Editor** → *New query* → paste the whole content of `cloud/supabase.sql` → **Run**.
   The last result lists the 6 `noema_` tables with `rls_enabled = true` (plus the storage buckets `noema-private`, `noema-public`, `noema-shared`). The script is idempotent: run it again after every update of the file.
   Then in the app: ⚙️ → Cloud → 🩺 **Check the cloud connection** — 8 ✅ means everything works (or `node tests/live_cloud.js`).
3. **Authentication → Sign In / Providers → Email**: enabled. (Optional for a personal app: turn off “Confirm email”.)
4. The two values the app needs (both public by design):
   * **Project URL** = `https://<project-ref>.supabase.co`. The project ref is the id in your dashboard address
     (`supabase.com/dashboard/project/<project-ref>`) and in the database host `db.<project-ref>.supabase.co`.
     It is also shown under **Project Settings → Data API** (or the **Connect** button at the top).
   * **Publishable key** (`sb_publishable_…`): **Project Settings → API Keys**. (Older projects: the `anon` key — also works.)
5. Put them into `config.js` (or give them to Claude):
   ```js
   supabaseUrl: 'https://<project-ref>.supabase.co',
   supabaseKey: 'sb_publishable_…',
   ```
   ⚠️ Never share the **secret** key (`sb_secret_…` / service_role) or the **database password** — the app needs neither.
   If you ever pasted the database password somewhere: **Project Settings → Database → Reset database password**.

### Optional: the Claude connector (users save subjects from their own Claude)
Supabase → **Authentication → OAuth Server** → enable, turn on **dynamic client registration**, authorization path **`/oauth/consent`**.
Nothing else to configure: the connector holds no secrets and checks every request with Supabase itself,
so it needs no JWT key, no environment variable and no Netlify setting. Details and checks: `docs/CLAUDE_CONNECTOR.md`.

## 3. Netlify (the website)
1. https://app.netlify.com → sign up with GitHub.
2. **Add new site → Import an existing project → GitHub** → authorise → pick `noema-lite`.
3. Netlify reads `netlify.toml` automatically (build `python3 tools/build.py site --no-validate`, publish `dist/site`,
   functions `dist/functions` → `/mcp` the Claude connector and `/api/img` the picture fetcher) → **Deploy**.
   No environment variables are needed. Netlify **Identity** is not used (accounts live in Supabase) — leave it off.
4. *Site configuration → Change site name* → e.g. `noema-lite` → your app is at `https://noema-lite.netlify.app` (if the name is taken, e.g. `noema-lite-anr`).
5. Back in Supabase: **Authentication → URL Configuration → Site URL** = that address (so confirmation/reset emails link back to it).

## 4. First sign-in & moving your local progress to the cloud
1. Open the website → **☁️ Sign in / create a cloud account** → create your account.
2. On the Mac, open the local app (`index.html`) as profile ANR → account menu (emoji top-right) → **☁️ Cloud** → sign in → **⬆️ Copy this profile into my cloud account**.
   (Or: local app → 💾 Download backup → website → 💾 Backup & restore → Restore.)
3. Your Gemini key: account menu → ⚙️ Settings once; it then syncs privately to all your devices.

## Database backup to the cloud
`python3 tools/db_sync.py` refreshes `data/noema-lite.db`. Upload it from the app: account menu → ☁️ Cloud → **🗄️ Upload database backup**.
It is stored privately at `noema-private/<your-user-id>/db/`.
