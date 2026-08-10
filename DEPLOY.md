# Deploying Zitie

No domain is purchased yet, so this is written to work in two phases:
**Phase 1** ships everything on the free provider subdomains (`*.vercel.app`,
`*.up.railway.app`, etc.) so you can use the real, hosted app today. **Phase 2**
is a 15-minute DNS cutover once you buy a domain — nothing about the app
changes, you're just pointing names at the same services.

Stack: **Neon** (Postgres) · a **container host** (API — Railway, Render, or any
host that builds a Dockerfile) · **Vercel** (web) · **Cloudflare** (DNS, once you
have a domain).

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

## 2. API — a container host

The API ships as a container. The `Dockerfile` and `.dockerignore` are committed
at the **repo root** (the monorepo build context needs the root lockfile), so
any host that builds a Dockerfile can run it — Railway and Render are the
easiest, and neither needs Docker installed locally; they build the image for
you. The steps below are written generically; each host's dashboard has the same
four knobs.

1. Create a new service and point it at this GitHub repo. Choose **Dockerfile**
   as the build, with the **repo root** as the build context (not `apps/api`).
   The image listens on the port given in `$PORT` (default `8787`) and already
   sets `NODE_ENV=production` in the Dockerfile — the production cookie mode
   (`SameSite=None; Secure`) keys off it.
2. Set environment variables (never commit these):
   ```
   DATABASE_URL   = <neon connection string>
   ANTHROPIC_API_KEY = <your anthropic key>   # AI card extraction
   RESEND_API_KEY = <your resend key>         # password reset emails
   WEB_ORIGIN     = https://<your-web-app-url> # optional now; see note
   ```
   `WEB_ORIGIN` takes a comma-separated list, so a preview deploy and production
   can both call the API:
   `https://zitie.vercel.app,https://zitie-git-main-you.vercel.app`.
   It only matters for a **browser** web app (Vercel, §3); the **mobile** app's
   WebView origins (`http://localhost`, `capacitor://localhost`) are already
   allow-listed in CORS, so the app works without it. Resend note: until you
   verify a domain, its test sender only delivers to your own Resend account
   email (set `EMAIL_FROM` once a domain is verified in Phase 2).
3. Set the **release / pre-deploy command** to `npm run db:deploy`. This runs
   **before** traffic shifts: it applies migrations and upserts the shared
   reference data — all 10,954 HSK 3.0 words and the 3,000 dex character
   breakdowns — so you don't migrate or seed by hand. The seed is idempotent and
   takes a few seconds; hand-written and AI-enriched rows survive it untouched.
   (Railway: Settings → Deploy → *Pre-deploy Command*. Render: *Pre-Deploy
   Command*. On a plain VM, run it once yourself before starting the server.)
4. Deploy. You'll get a URL like `https://<service>.up.railway.app`.
5. Sanity check: `curl https://<service>.up.railway.app/health` → `{"ok":true}`.

Then tell me the URL and I'll rebuild the mobile app + `cap sync` pointing at it,
so login works on the emulator/phone (HTTPS enables the secure cross-site
session cookie).

## 3. Web — Vercel

1. Push this repo to GitHub (`gh repo create` or via the GitHub UI), then
   import it in Vercel.
2. Project settings:
   - **Root directory**: `apps/web`
   - **Build command**: `npm run build` (Vercel auto-detects Vite)
   - **Output directory**: `dist`
3. Env var: `VITE_API_URL=https://<service>.up.railway.app` (your API URL from
   §2). `apps/web/vercel.json` already supplies the SPA rewrite and keeps
   `/sw.js` uncached, so a new build isn't shadowed by a stale service worker.
4. Deploy. You'll get `https://<project>.vercel.app`.
5. Go back to the API host and set `WEB_ORIGIN` to this exact URL if you
   didn't already (step 2.2) — CORS will reject requests otherwise. Vercel
   gives every preview deployment its own hostname, and those are rejected
   too; add the ones you actually test against to the comma-separated list.
   Origins are matched exactly, never by pattern: cookies ride on these
   requests, so `*.vercel.app` would let any app on that shared domain call
   the API as a logged-in user. A trailing slash is tolerated.

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
   | Type  | Name  | Target                          |
   |-------|-------|---------------------------------|
   | CNAME | `@`   | `cname.vercel-dns.com`          |
   | CNAME | `www` | `cname.vercel-dns.com`          |
   | CNAME | `api` | `<service>.up.railway.app`      |

   Vercel apex domains sometimes want an `A` record instead of `CNAME` at
   `@` — Vercel's domain settings page tells you which once you add the
   domain there; follow whatever it shows over this table if they differ.
3. **Attach the domain in each provider's dashboard**, not just DNS:
   - Vercel → Project → Settings → Domains → add `yourdomain.com` and `www`.
   - API host → add `api.yourdomain.com` as a custom domain; Railway and
     Render both issue a Let's Encrypt cert automatically once the CNAME
     resolves.
4. **Flip the env vars** to the real domain and redeploy both:
   - Vercel: `VITE_API_URL=https://api.yourdomain.com`
   - API host: `WEB_ORIGIN=https://yourdomain.com`
5. TLS is automatic on all three (Cloudflare, Vercel, your API host) — nothing
   to configure beyond attaching the domain.

Cookies: the API sets `SameSite=None; Secure` in production specifically so
auth works across `yourdomain.com` ↔ `api.yourdomain.com` (and works
identically during Phase 1 across the mismatched `vercel.app`/host domains) —
see [`apps/api/src/lib/auth.ts`](apps/api/src/lib/auth.ts). No change needed
here when you cut over DNS.

---

## Ongoing

- **Migrations**: any schema change → `npm run db:generate` locally, commit
  the generated SQL under `apps/api/drizzle/`, then the host's release /
  pre-deploy command (`npm run db:deploy`) applies it automatically on next
  deploy.
- **Logs**: your API host's dashboard (Railway/Render both stream build and
  runtime logs); Vercel's dashboard → Deployments → Functions tab for the web.
- **Rollback**: redeploy a previous commit from the API host's dashboard;
  Vercel dashboard → Deployments → "Promote to Production" on any older build
  for the web.
