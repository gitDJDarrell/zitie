import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import {
  clearSessionCookie, consumeResetToken, createResetToken, createSession,
  destroyAllUserSessions, destroySession, hashPassword, purgeExpiredSessions,
  requireAuth, setSessionCookie, verifyPassword,
} from "../lib/auth.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { rateLimit } from "../lib/rateLimit.js";

export const auth = new Hono();

const credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

// Body-derived email key means rotating IPs doesn't help against one account.
const emailKey = (_c: unknown, body: unknown) => {
  const email = (body as { email?: unknown } | null)?.email;
  return typeof email === "string" ? `email:${email.trim().toLowerCase()}` : null;
};

auth.use("/signup", rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }));
auth.use("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyExtra: emailKey }));
auth.use("/forgot", rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyExtra: emailKey }));
auth.use("/reset", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }));

auth.post("/signup", async (c) => {
  const parsed = credentials.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, 400);
  }
  const { email, password } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) {
    return c.json({ error: "An account with that email already exists." }, 409);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email, passwordHash }).returning({ id: users.id, email: users.email });

  const session = await createSession(user.id);
  setSessionCookie(c, session.id, session.expiresAt);
  return c.json({ id: user.id, email: user.email }, 201);
});

auth.post("/login", async (c) => {
  const parsed = credentials.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid email or password." }, 400);
  }
  const { email, password } = parsed.data;

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: "Invalid email or password." }, 401);
  }

  const session = await createSession(user.id);
  setSessionCookie(c, session.id, session.expiresAt);
  // Opportunistic cleanup — logins are frequent enough to keep the table tidy
  // without a scheduler, and a failure here must not break the login.
  purgeExpiredSessions().catch(() => {});
  return c.json({ id: user.id, email: user.email });
});

auth.post("/forgot", async (c) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Enter a valid email address." }, 400);
  }
  const { email } = parsed.data;

  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (rows.length) {
    const token = await createResetToken(rows[0].id);
    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
    // Fire-and-forget: response timing must not reveal whether the account exists.
    sendPasswordResetEmail(email, `${webOrigin}/?reset=${token}`).catch((err) => console.error(err));
  }
  // Same response either way — no account enumeration.
  return c.json({ ok: true });
});

auth.post("/reset", async (c) => {
  const parsed = z.object({
    token: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters."),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, 400);
  }

  const userId = await consumeResetToken(parsed.data.token);
  if (!userId) {
    return c.json({ error: "This reset link is invalid or has expired. Request a new one." }, 400);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await destroyAllUserSessions(userId); // any stolen session dies with the old password

  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, "zitie_session");
  if (token) await destroySession(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  return c.json({ id: c.get("userId"), email: c.get("userEmail") });
});
