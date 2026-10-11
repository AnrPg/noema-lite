# Weblate for noema-lite

The translation platform of noema-lite: **Weblate, self-hosted**, designed in from day one (docs/i18n.md §2, §9).
The repository stays the single source of truth: `i18n/<component>/en.arb` is edited in the repo only; translations
are edited only in Weblate, which sends them back as **pull requests from the branch `weblate-translations`** — never
to `main`. Claude's drafts go in as *needs editing*; only **approved** strings are written to the repository.
Translators accept a contributor agreement covering commercial use first (`CLA.md`, still a DRAFT for a lawyer).

Nothing in this folder deploys anything. Files:

| File | What |
|---|---|
| `docker-compose.yml` | Weblate `2026.10.1.0`, Valkey (Redis), Caddy (TLS), and PostgreSQL behind the profile `localdb` |
| `Caddyfile` | HTTPS reverse proxy (Let's Encrypt) |
| `.env.example` | every setting, no secret — copy to `.env` on the server |
| `components.yaml` | projects, components, checks, add-ons — applied by `tools/i18n/weblate_setup.py` |
| `CLA.md` | the contributor agreement — **DRAFT, must be reviewed by a lawyer before use** |

Tools (`tools/i18n/`): `weblate_setup.py` (configuration as code, `init-locale`, webhook help),
`weblate_import_drafts.py` (Claude's drafts → *needs editing*), `weblate_facades.py` (language-course facades ⇄
Weblate), `prune_drafts.js` (drop drafts that were approved). Tests: `python3 tests/weblate_tools.py` (no network).

## 1. Where to run it until the own server exists

Weblate is a Django application with Celery workers, PostgreSQL and Redis, plus Git checkouts on a persistent disk
(`/app/data`). It needs a host that keeps **long-running processes and a disk**.

* **Netlify cannot host it**: static files plus short-lived serverless functions — no resident processes, no Celery
  workers, no disk for Git working copies, no SSH key.
* **Supabase alone cannot host it**: Postgres, Auth, Storage and Edge Functions (short-lived Deno functions) — no place
  to run Django, Celery or Git. Supabase **can be Weblate's database** (below); Supabase has no Redis.
* So "temporarily on the current vendors" means: **Supabase Postgres as the database + one small container host**
  for Weblate, Redis and TLS. The same `docker-compose.yml` later runs on the own server.

| Option | Cost (approx., Oct 2026 list prices — check) | Good | Watch out |
|---|---|---|---|
| **Hosted Weblate, Libre plan** | free | no operations | **not eligible**: only for public (libre) projects; noema-lite is private and commercial |
| **Hosted Weblate, paid** | by *hosted strings* = source strings × (languages + 1). UI catalogs ≈ 4 200 keys × 15 ≈ 63 k → 160 k plan ≈ €114 / month; with the language-course facades (≈ 97 000 texts × 15 ≈ 1.5 M) → 2.5 M plan ≈ €342 / month | no operations, backups and upgrades included, 14-day trial; GitHub app for PRs | data with one more vendor; leaving later = project backups (Operations → Backups) imported into the own instance |
| **Small VM + this compose** (Hetzner Cloud 2 vCPU / 4 GB, or any VPS) | ≈ €5–10 / month | cheapest; identical to the later own server; full control; database either Supabase or the `localdb` profile | you run updates, backups, firewall; a new vendor (the VM provider) |
| **Fly.io** (Machine + volume) | ≈ $20–40 / month for 4 GB RAM + volume + a small Redis machine | no server to patch; IPv6 egress reaches Supabase's direct connection | the compose file has to become a `fly.toml` per service; one volume per machine; Caddy not needed (Fly terminates TLS) |
| **Render** (Docker web service + persistent disk + Key Value) | ≈ $35–50 / month (Standard 2 GB + disk + Key Value) | managed TLS and deploys from the image | a persistent disk needs a paid instance and blocks zero-downtime deploys; egress is IPv4 only → Supabase **session pooler** |
| **Railway** (template or compose import + volume) | usage based, ≈ $15–30 / month | quick start, Redis add-on | usage billing is hard to predict for Celery's background work |

**Recommendation:** a small VM (2 vCPU / 4 GB RAM — Weblate's documented minimum for everything on one host is 3 GB
RAM and 2 cores) running this compose file, with **Supabase as the external database** as long as the owner wants
the temporary setup on the current vendors. The move to the own server is then a copy of one volume and one
database dump (§6). Hosted Weblate is the "no operations" alternative, but it is the most expensive option once the
language-course facades are in it.

### Supabase as Weblate's database

* Use a **separate Supabase project** for Weblate, not the app's project: its own credentials, size and backups, no
  chance of touching the app's tables, row-level security or auth schema.
* **Size.** Free plan: 500 MB and the project is **paused after a week of inactivity** — enough to try the UI
  catalogs, not for production and not for the language-course facades (≈ 1.5 M strings with history and search
  indexes need several GB). Pro (8 GB disk included, daily backups kept 7 days, never paused) for real use.
* **Extensions** (Dashboard → Database → Extensions): enable `pg_trgm`, `btree_gin`, `btree_gist` before the first
  start; Weblate's migrations create them only when the role is allowed to.
* **Connection**: Dashboard → Connect → *Session pooler* (IPv4, port 5432, user `postgres.<project-ref>`); the direct
  connection `db.<ref>.supabase.co` is IPv6 only unless the IPv4 add-on is bought; the *transaction* pooler (6543)
  breaks server-side cursors and is not suitable. `POSTGRES_SSL_MODE=require`. Keep the process count small
  (`WEBLATE_WORKERS=2` ≈ 10 connections) — Supabase → Database → Connections shows the pool.
* The region of the Supabase project should be close to the VM (every page is many queries).

## 2. First start (by the owner, on the server)

1. DNS: `translate.<your domain>` → the server. Firewall: 80 and 443 open, SSH restricted.
2. `cp weblate/.env.example weblate/.env`, fill it in (database, e-mail, domain), `chmod 600 weblate/.env`.
3. `docker compose -f weblate/docker-compose.yml up -d` (own database: add `--profile localdb` and the B block of
   `.env`). `docker compose -f weblate/docker-compose.yml logs -f weblate` shows the migrations and, on the very
   first start, the generated admin password — log in, change it, turn on two-factor authentication (profile →
   Account security).
4. **SSH key for Git**: Weblate → Manage → SSH keys → *Generate Ed25519 SSH key*; *Add host key* for `github.com`.
   GitHub → the repository → Settings → Deploy keys → add Weblate's public key, **Allow write access** (it can push
   only to this repository).
5. **API token for pull requests**: GitHub → Settings → Developer settings → Fine-grained token, only the noema-lite
   repository, *Pull requests: read and write*, *Contents: read and write* (what Weblate's documentation asks for;
   the pushes themselves go through the deploy key); put it in `WEBLATE_GITHUB_TOKEN`, restart.
   Protect `main` (Settings → Branches): require a pull request and the `i18n` check.
6. On your computer: `export WEBLATE_URL=https://translate.<domain> WEBLATE_API_TOKEN=wlu_…` (your Weblate profile →
   API access), replace `OWNER` and the site URL in `weblate/components.yaml`, then
   `python3 tools/i18n/weblate_setup.py plan` → `apply` (reads only) → `apply --apply`. Run it again whenever a new
   `i18n/<component>/` appears; it never deletes.
7. Settings the API may not take (the script says so): project → Settings → Workflow → **Translation quality filter =
   "Only include approved translations"** for both projects.
8. Webhook: `python3 tools/i18n/weblate_setup.py webhook` prints the steps (GitHub → Settings → Webhooks →
   `https://translate.<domain>/hooks/github/`, JSON, push events).
9. People: Weblate → project → Users: invite translators (role *Translate*) and reviewers (role *Review strings*) per
   project / language. Registration stays closed (`WEBLATE_REGISTRATION_OPEN=0`, `WEBLATE_REQUIRE_LOGIN=1`).
10. The contributor agreement: once a lawyer has reviewed `CLA.md` and the DRAFT notice is gone, `apply --apply`
    sets it on every component (component → Settings → *Contributor license agreement*); Weblate then asks every user
    to accept it before their first translation and records who accepted what and when.
11. Drafts: `python3 tools/i18n/weblate_import_drafts.py` (plan) → `--apply`.

## 3. GitHub: how translations come back

* Components use the VCS **GitHub pull request** with the SSH repository URL and **push branch
  `weblate-translations`**: Weblate commits in its clone, squashes per language (add-on *Squash Git commits*), pushes
  the branch with its deploy key and opens or updates one pull request `weblate-translations → main` with the API
  token. All UI components share one clone (`weblate://noema-lite/core`), so there is one pull request.
* The owner reviews and merges. CI (`.github/workflows/i18n.yml`) runs `node tools/i18n/check.js` (ICU syntax,
  placeholders as in English, every CLDR plural category of the locale, apostrophes, sensitive keys) and
  `node tests/i18n.js` on the pull request. After merging: `node tools/i18n/prune_drafts.js --write` in a normal commit.
* Webhook GitHub → Weblate on every push, so Weblate rebases its branch on the new `main` and sees new English keys.
  Weblate matches the webhook to components **by exact repository URL** — keep the SSH URL from
  `components.yaml`. (The *GitHub app* integration of newer Weblate versions — authenticated webhooks, no deploy key —
  is an alternative; it needs a Weblate workspace.)
* `main` is never written by Weblate: no push URL points at it and branch protection refuses it anyway.

## 4. The glossary component

`i18n/glossary/<locale>.csv` (bilingual CSV) becomes Weblate's glossary for the UI project, so terms are highlighted
while translating. Weblate reads and writes CSV through translate-toolkit, which knows the columns `source`, `target`,
`developer_comments` (and a few others) — **a column called `description` is written back empty** on Weblate's
first commit. So `i18n/glossary/*.csv` and `i18n/glossary/drafts/*.csv` use the header
`source,target,developer_comments` (renamed 2026-10-11; `tools/lang_facade.py` function `glossary` accepts both names),
and `weblate_setup.py` leaves the glossary out if any of them goes back to `description`. `terms.csv` (the
English term list) is excluded by the component's language filter.

## 5. Language-course facades (separate project `noema-lite-courses`)

The facades (`library/languages/<course>/facades/<locale>/*.json`, `{address: {t, src, by}}`) are not a Weblate
format, and 97 000 texts per locale do not belong in the UI project. `tools/i18n/weblate_facades.py` converts them to
flat monolingual JSON on an **exchange branch** `weblate-facades` (derived data; `main` keeps the facades):

```sh
git worktree add ../noema-wf weblate-facades     # first time: git worktree add --orphan -b weblate-facades ../noema-wf
python3 tools/i18n/weblate_facades.py export library/languages/<course> --out ../noema-wf/weblate-facades
git -C ../noema-wf add -A && git -C ../noema-wf commit -m "facades: export" && git -C ../noema-wf push -u origin weblate-facades
python3 tools/i18n/weblate_setup.py apply --facades ../noema-wf/weblate-facades --apply      # components from INDEX.json
python3 tools/i18n/weblate_import_drafts.py --facades ../noema-wf/weblate-facades --apply    # Claude's facade texts → needs editing
# … reviewers approve in Weblate; Weblate opens a PR weblate-facades-translations → weblate-facades; merge it, then:
git -C ../noema-wf pull
python3 tools/i18n/weblate_facades.py import library/languages/<course> --from ../noema-wf/weblate-facades          # dry run
python3 tools/i18n/weblate_facades.py import library/languages/<course> --from ../noema-wf/weblate-facades --write  # → a PR to main
```

Keys are `<address>#<hash of the English master text>`: a changed master text is a new key (Weblate's translation
memory offers the old translation), and `import` writes `src` = that hash, so `lang_facade.py parity` still tells
*stale* from *done*. Entries stay `by: "claude"` until approved in Weblate (`by: "weblate"` after import).
**The courses project must use "Only include approved translations"**: `import` treats every string in a file
Weblate wrote as approved.

## 6. Backups

What exists only in Weblate (the repository already has every *approved* translation): unapproved translations,
suggestions, comments, review state, users and roles, contributor-agreement acceptances, translation memory.

* **Database**: the container dumps it daily to `/app/data/backups/database.sql` (`WEBLATE_DATABASE_BACKUP`, default
  `plain`). Supabase Pro also keeps daily backups for 7 days; the free plan has none.
* **BorgBackup, built in**: Weblate → Manage → Backups → add a repository (an SSH destination on another machine, or
  a mounted path) → encrypted, incremental daily backups of `/app/data` including the dump. **Download and store the
  Borg encryption key** — without it the backups cannot be restored.
* **Project backups** (project → Operations → Backups): a ZIP of a project's components, translations, comments and
  teams — portable to any Weblate instance; take one before every upgrade and before the move.
* Volumes: `weblate-data` (Git clones, SSH key, generated secret key, media, dumps) matters; `weblate-cache` and
  `redis-data` can be rebuilt; `postgres-data` only with `--profile localdb`; `caddy-data` holds certificates.
* Test a restore once (a throw-away VM: restore the volume and the dump, start, log in).

## 7. Upgrades

* The image is pinned (`weblate/weblate:2026.10.1.0`; Valkey, PostgreSQL, Caddy too). To upgrade: read the release
  notes (docs.weblate.org → Changes), take a project backup, change the tag in a pull request, then on the server
  `docker compose -f weblate/docker-compose.yml pull && docker compose -f weblate/docker-compose.yml up -d` and watch
  the logs — database migrations run on start.
* Weblate supports direct upgrades only from releases of the current or previous calendar year: upgrade at least
  once a year (better: monthly, it also brings security fixes).
* PostgreSQL major versions (own server only): dump, start the new major with an empty volume, restore — never point
  a new major at the old data volume. Supabase upgrades its own Postgres.
* The scripts follow the REST API documented at `/api/schema/` of the instance; check `weblate_setup.py apply` (dry
  run) after an upgrade.

## 8. Moving to the own server later

The compose file is the same; only the database changes from Supabase to the `localdb` profile.

1. Announce a short freeze; in Weblate: Manage → *Lock* all components (or project → Operations → Lock), make sure
   pending changes are committed and pushed (Repository maintenance → Commit, Push) and the last PR is merged.
2. Project backups of both projects (safety net).
3. Database: `pg_dump --no-owner --no-privileges -Fc "<Supabase session-pooler URI>" > weblate.dump`; on the new
   server start only the database (`docker compose --profile localdb up -d database`), then
   `docker compose exec -T database pg_restore --no-owner -U weblate -d weblate < weblate.dump`.
4. Files: stop Weblate on the old host, copy the `weblate-data` volume (`docker run --rm -v noema-weblate_weblate-data:/v
   -v $PWD:/b alpine tar czf /b/data.tgz -C /v .`, then the reverse on the new host). It contains the SSH key (the
   GitHub deploy key stays valid) and the secret key (sessions and two-factor settings stay valid).
5. `.env`: switch to the B block (local database), keep `WEBLATE_SITE_DOMAIN`; start; point DNS at the new server;
   Caddy gets a certificate on the first request. Webhook URL and tokens stay the same.
6. Unlock, check a translation round trip (translate, approve, see the PR update), then delete the Supabase project.

## 9. Security notes

Invitation only, login required, both projects private (`access_control: 100`). The API token of the scripts lives
only in your shell environment; the server's secrets only in `weblate/.env` (never committed). The GitHub token can
only open pull requests on one repository, the deploy key can only push to it, and branch protection keeps `main`
for the owner. The generic GitHub webhook endpoint is unauthenticated by design (anyone who knows the URL can make
Weblate *fetch*), which cannot change any translation.
