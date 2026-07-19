import type { Context, MiddlewareHandler } from "hono";

// Sliding-window in-memory rate limiter. Per-process state is fine for a
// single API instance; if the API ever scales horizontally this needs to move
// to a shared store (e.g. Postgres or Redis).

interface Options {
  windowMs: number;
  max: number;
  // Extra key derived from the request body (e.g. the login email), so an
  // attacker rotating IPs still can't hammer one account.
  keyExtra?: (c: Context, body: unknown) => string | null;
}

const buckets = new Map<string, number[]>();

// Drop empty buckets occasionally so the map doesn't grow unbounded.
let lastSweep = Date.now();
function sweep(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const live = hits.filter((t) => now - t < windowMs);
    if (live.length) buckets.set(key, live);
    else buckets.delete(key);
  }
}

function clientIp(c: Context) {
  // Fly/Vercel/most proxies set x-forwarded-for; first hop is the client.
  const fwd = c.req.header("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "local";
}

function hit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function rateLimit({ windowMs, max, keyExtra }: Options): MiddlewareHandler {
  return async (c, next) => {
    sweep(windowMs);
    const path = new URL(c.req.url).pathname;
    const keys = [`${path}:ip:${clientIp(c)}`];
    if (keyExtra) {
      const body = await c.req.json().catch(() => null);
      const extra = keyExtra(c, body);
      if (extra) keys.push(`${path}:${extra}`);
    }
    const allowed = keys.map((k) => hit(k, windowMs, max));
    if (allowed.includes(false)) {
      return c.json({ error: "Too many attempts — try again in a few minutes." }, 429);
    }
    await next();
  };
}
