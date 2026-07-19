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

1. Install `flyctl`, `fly auth login`.
2. From `apps/api`:
   ```
   fly launch --no-deploy   # creates fly.toml, pick a unique app name e.g. zitie-api
   ```
3. Set secrets (never commit these):
   ```
   fly secrets set DATABASE_URL="<neon connection string>"
   fly secrets set SESSION_SECRET="<openssl rand -hex 32>"
   fly secrets set WEB_ORIGIN="https://<your-vercel-app>.vercel.app"
   fly secrets set NODE_ENV=production
   ```
4. Add a release step so migrations run automatically on every deploy —
   in `fly.toml`:
   ```toml
   [deploy]
     release_command = "npm run db:migrate"
   ```
   (runs via `tsx`, which is a regular `dependency` — not `devDependency` —
   of `apps/api` for exactly this reason, so it's present in the production
   install.)
5. Deploy: `fly deploy`. You'll get `https://zitie-api.fly.dev`.
6. Sanity check: `curl https://zitie-api.fly.dev/health` → `{"ok":true}`.

Railway is an equally good alternative if you'd rather have a dashboard:
new project → deploy from the `apps/api` folder → same env vars → Railway
auto-detects the Node app and gives you a `*.up.railway.app` URL.

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
