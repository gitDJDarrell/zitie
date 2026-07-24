# Production image for the Zitie API (apps/api) in this npm-workspaces monorepo.
# Build context is the repo ROOT so the workspace lockfile resolves correctly.
# Multi-stage: the build stage has all devDeps (TypeScript, etc.); the runtime
# stage installs prod deps only — which also drops the large embedded-postgres
# dev dependency used only for local development.

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run build --workspace apps/api

# ---- runtime ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev && npm cache clean --force
# Compiled server + the files the release command (migrate + seed insights)
# needs: drizzle migrations, the scripts, src (seed-insights imports from it),
# and the seed data. tsx is a prod dependency, so it runs in this image.
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/scripts apps/api/scripts
COPY apps/api/src apps/api/src
COPY apps/api/data apps/api/data
WORKDIR /app/apps/api
EXPOSE 8787
CMD ["node", "dist/index.js"]
