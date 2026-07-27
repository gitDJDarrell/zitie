# 字帖 (Zitie)

Mandarin character flashcard app — monorepo with a Vite/React client and a
Hono/Node API backed by Postgres.

```
apps/
  web/   Vite + React + TypeScript client (study / browse / import)
  api/   Hono + Drizzle ORM REST API (auth, cards, seen-state, settings)
```

## Local development

Requires Node 20+ and a Postgres database (see "Local database" below).

```
npm install
cp apps/api/.env.example apps/api/.env      # fill in DATABASE_URL, SESSION_SECRET
cp apps/web/.env.example apps/web/.env      # fill in VITE_API_URL

npm run db:migrate                          # apply schema
npm run db:seed                             # load seed-dev.json for the dev user
npm run db:seed-reference --workspace apps/api   # HSK words + character breakdowns

npm run dev:api                             # http://localhost:8787
npm run dev:web                             # http://localhost:5173
```

## Local database

No Postgres install needed — `npm run db:local` (from `apps/api`) downloads and
runs an embedded Postgres, storing data in `apps/api/.pgdata`. Leave it running
in its own terminal; the default `DATABASE_URL` in `.env.example` points at it.
Dev login after seeding: `dev@zitie.local` / `dev-password-change-me`.

Alternatives if you'd rather bring your own database:

- [Neon](https://neon.tech) free tier (also what's recommended for production — see below)
- Docker: `docker run -e POSTGRES_PASSWORD=zitie -e POSTGRES_DB=zitie -p 5432:5432 postgres:16`

## Reference data

The app ships with the whole of HSK 3.0 already in the database: 10,954 words
with readings and glosses, and a breakdown for each of the 3,000 dex
characters. Nothing a learner unlocks has to be looked up or generated first.
`npm run db:deploy` (migrate + seed) puts it there; the files, how they're
built, and the licenses they carry are in
[apps/api/data/ATTRIBUTION.md](./apps/api/data/ATTRIBUTION.md).

See [DEPLOY.md](./DEPLOY.md) for hosting + DNS once you're ready to ship.
