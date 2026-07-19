import bcrypt from "bcryptjs";
import { and, eq, gt, lt } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { nanoid } from "nanoid";
import type { Context, MiddlewareHandler } from "hono";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

export const SESSION_COOKIE = "zitie_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const id = nanoid(48);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

const isProd = process.env.NODE_ENV === "production";

export function setSessionCookie(c: Context, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    // "None" in prod: web and api live on different subdomains (and, before DNS
    // cutover, entirely different hosting-provider domains), so the cookie must
    // be sendable cross-site. Requires `secure: true`, which needs HTTPS —
    // true on every host in the deploy guide.
    sameSite: isProd ? "None" : "Lax",
    secure: isProd,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

async function loadSessionUser(token: string) {
  const rows = await db
    .select({ userId: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
    userEmail: string;
  }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await loadSessionUser(token) : null;
  if (!session) {
    return c.json({ error: "Not authenticated." }, 401);
  }
  c.set("userId", session.userId);
  c.set("userEmail", session.email);
  await next();
};

export async function destroySession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, token));
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
