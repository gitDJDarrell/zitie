# Deploying Zitie

No domain is purchased yet, so this is written to work in two phases:
**Phase 1** ships everything on the free provider subdomains (`*.vercel.app`,
`*.fly.dev`, etc.) so you can use the real, hosted app today. **Phase 2** is a
15-minute DNS cutover once you buy a domain — nothing about the app changes,
you're just pointing names at the same services.

Stack: **Neon** (Postgres) · **Fly.io** (API) · **Vercel** (web) ·
**Cloudflare** (DNS, once you have a domain).

---

## 1. Database — Neon

1. Create a free account at neon.tech, create a project (any region close to
   where you'll run the API).
2. Copy the pooled connection string it gives you — that's your
   `DATABASE_URL`. Keep it secret; it goes in the API's env vars only, never
   in the web app or in git.
3. From your machine, apply the schema against the real database:
   ```
   cd apps/api
   DATABASE_URL="<neon connection string>" npm run db:generate   # only if schema.ts changed since last generate
   DATABASE_URL="<neon connection string>" npm run db:migrate
   ```
4. Optional: seed a dev account into it the same way —
   `NODE_ENV=development DATABASE_URL="<neon>" npm run db:seed` — or skip
   this for a production database and let real users sign up through the UI
   (`GET /cards` correctly returns `[]` for a brand-new account, and Import
   is the empty-state entry point).

## 2. API — Fly.io

The `Dockerfile`, `fly.toml`, and `.dockerignore` are committed at the **repo
root** (the monorepo build context needs the root lockfile), so you run all
`fly` commands **from the repo root**, not `apps/api`. Fly builds the image on
its remote builders — you do **not** need Docker installed locally.

1. Install `flyctl` (`iwr https://fly.io/install.ps1 -useb | iex` on Windows
   PowerShell), then `fly auth signup` (or `fly auth login`).
2. From the **repo root**:
   ```
   fly launch --no-deploy
   ```
   It detects the existing `fly.toml` + `Dockerfile` and adopts them; just
   confirm/pick a unique app name (if `zitie-api` is taken it'll offer another
   and rewrite the `app =` line) and a region.
3. Set secrets (never commit these):
   ```
   fly secrets set DATABASE_URL="<neon connection string>"
   fly secrets set SESSION_SECRET="<a long random string — `openssl rand -hex 32`>"
   fly secrets set ANTHROPIC_API_KEY="<your anthropic key>"   # AI card extraction
   fly secrets set RESEND_API_KEY="<your resend key>"         # password reset emails
   fly secrets set WEB_ORIGIN="https://<your-web-app-url>"    # optional now; see note
   ```
   `NODE_ENV=production` and `PORT` are already set in `fly.toml` `[env]` — the
   production cookie mode (`SameSite=None; Secure`) keys off `NODE_ENV`.
   `WEB_ORIGIN` only matters for a **browser** web app (Vercel, §3); the
   **mobile** app's WebView origins (`http://localhost`, `capacitor://localhost`)
   are already allow-listed in CORS, so the app works without it. Resend note:
   until you verify a domain, its test sender only delivers to your own Resend
   account email (set `EMAIL_FROM` once a domain is verified in Phase 2).
4. Deploy from the repo root:
   ```
   fly deploy
   ```
   The `release_command` in `fly.toml` (`npm run db:deploy`) runs **before**
   traffic shifts: it applies migrations and upserts the shared character-insight
   reference data — so you don't need to migrate manually. You'll get
   `https://zitie-api.fly.dev` (or your chosen name).
5. Sanity check: `curl https://zitie-api.fly.dev/health` → `{"ok":true}`.

Then tell me the URL and I'll rebuild the mobile app + `cap sync` pointing at it,
so login works on the emulator/phone (HTTPS enables the secure cross-site
session cookie).

Railway is an equally good alternative if you'd rather have a dashboard:
new project → point it at this repo → it uses the root `Dockerfile` → same env
vars → gives you a `*.up.railway.app` URL.

## 3. Web — Vercel

1. Push this repo to GitHub (`gh repo create` or via the GitHub UI), then
   import it in Vercel.
2. Project settings:
   - **Root directory**: `apps/web`
   - **Build command**: `npm run build` (Vercel auto-detects Vite)
   - **Output directory**: `dist`
3. Env var: `VITE_API_URL=https://zitie-api.fly.dev` (or your Railway URL).
4. Deploy. You'll get `https://<project>.vercel.app`.
5. Go back to Fly/Railway and set `WEB_ORIGIN` to this exact URL if you
   didn't already (step 2.3) — CORS will reject requests otherwise.

Cloudflare Pages works the same way if you'd rather keep DNS and hosting in
one dashboard: root directory `apps/web`, build command `npm run build`,
output `dist`.

At this point the app is fully live on the provider subdomains — sign up,
import `seed-dev.json` yourself via the Import tab, study. This is a
reasonable place to stop if you're not ready to buy a domain yet.

---

## 4. Domain + DNS (Phase 2, once you own a domain)

Buy the domain wherever you like (Cloudflare Registrar, Namecheap, Porkbun —
doesn't matter). Then:

1. **Point nameservers at Cloudflare** (free plan): add the site in
   Cloudflare, it gives you two nameservers, set those at your registrar.
   Propagation is usually under an hour, occasionally up to 24-48h.
2. **DNS records** (all proxied — orange cloud on — for free TLS + caching):
   | Type  | Name  | Target                        |
   |-------|-------|-------------------------------|
   | CNAME | `@`   | `cname.vercel-dns.com`        |
   | CNAME | `www` | `cname.vercel-dns.com`        |
   | CNAME | `api` | `zitie-api.fly.dev`           |

   Vercel apex domains sometimes want an `A` record instead of `CNAME` at
   `@` — Vercel's domain settings page tells you which once you add the
   domain there; follow whatever it shows over this table if they differ.
3. **Attach the domain in each provider's dashboard**, not just DNS:
   - Vercel → Project → Settings → Domains → add `yourdomain.com` and `www`.
   - Fly → `fly certs add api.yourdomain.com` (issues a Let's Encrypt cert
     automatically once the CNAME resolves).
4. **Flip the env vars** to the real domain and redeploy both:
   - Vercel: `VITE_API_URL=https://api.yourdomain.com`
   - Fly: `fly secrets set WEB_ORIGIN=https://yourdomain.com`
5. TLS is automatic on all three (Cloudflare, Vercel, Fly) — nothing to
   configure beyond attaching the domain.

Cookies: the API sets `SameSite=None; Secure` in production specifically so
auth works across `yourdomain.com` ↔ `api.yourdomain.com` (and works
identically during Phase 1 across the mismatched `vercel.app`/`fly.dev`
domains) — see [`apps/api/src/lib/auth.ts`](apps/api/src/lib/auth.ts). No
change needed here when you cut over DNS.

---

## Ongoing

- **Migrations**: any schema change → `npm run db:generate` locally, commit
  the generated SQL under `apps/api/drizzle/`, then the Fly release command
  applies it automatically on next deploy.
- **Logs**: `fly logs` (API), Vercel's dashboard → Deployments → Functions
  tab (web build/runtime logs).
- **Rollback**: `fly releases` + `fly deploy --image <previous>` for the API;
  Vercel dashboard → Deployments → \"Promote to Production\" on any older
  build for the web.
