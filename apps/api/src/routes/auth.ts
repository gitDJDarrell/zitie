import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import {
  clearSessionCookie, createSession, destroySession, hashPassword,
  requireAuth, setSessionCookie, verifyPassword,
} from "../lib/auth.js";

export const auth = new Hono();

const credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

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
  return c.json({ id: user.id, email: user.email });
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
