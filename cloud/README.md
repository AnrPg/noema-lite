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
3. *File → Add Local Repository…* → choose `Documents/MyApps/learning-quest` (Claude already initialised it and made the first commit).
4. Click **Publish repository** → keep **“Keep this code private”** ticked → Publish.
5. From now on: when Claude has made changes, open GitHub Desktop → **Push origin**. (Claude commits; you push.)

## 2. Supabase (accounts + sync)
1. https://supabase.com → *Start your project* → sign in with GitHub → **New project** (name `learning-quest`, region *Frankfurt (eu-central-1)*, generate a DB password and store it in your password manager).
2. When ready: left menu **SQL Editor** → *New query* → paste the whole content of `cloud/supabase.sql` → **Run** (“Success. No rows returned”).
3. **Authentication → Sign In / Providers → Email**: enabled. (Optional for a personal app: turn off “Confirm email”.)
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
5. Give both to Claude (they are public by design) — or paste them into `config.js` yourself:
   ```js
   supabaseUrl: 'https://xxxxxxxx.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi…',
   ```
   ⚠️ Never share the `service_role` key or the database password.

## 3. Netlify (the website)
1. https://app.netlify.com → sign up with GitHub.
2. **Add new site → Import an existing project → GitHub** → authorise → pick `learning-quest`.
3. Netlify reads `netlify.toml` automatically (build `python3 tools/build.py site --no-validate`, publish `dist/site`) → **Deploy**.
4. *Site configuration → Change site name* → e.g. `anr-learning-quest` → your app is at `https://anr-learning-quest.netlify.app`.
5. Back in Supabase: **Authentication → URL Configuration → Site URL** = that address (so confirmation/reset emails link back to it).

## 4. First sign-in & moving your local progress to the cloud
1. Open the website → **☁️ Sign in / create a cloud account** → create your account.
2. On the Mac, open the local app (`index.html`) as profile ANR → account menu (emoji top-right) → **☁️ Cloud** → sign in → **⬆️ Copy this profile into my cloud account**.
   (Or: local app → 💾 Download backup → website → 💾 Backup & restore → Restore.)
3. Your Gemini key: account menu → ⚙️ Settings once; it then syncs privately to all your devices.

## Database backup to the cloud
`python3 tools/db_sync.py` refreshes `data/learning-quest.db`. Upload it from the app: account menu → ☁️ Cloud → **🗄️ Upload database backup**.
It is stored privately at `lq-private/<your-user-id>/db/`.
