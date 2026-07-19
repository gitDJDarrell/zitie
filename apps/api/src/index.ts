import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./routes/auth.js";
import { cardsRoute } from "./routes/cards.js";
import { exportRoute } from "./routes/export.js";
import { seenRoute } from "./routes/seen.js";
import { settingsRoute } from "./routes/settings.js";

const app = new Hono();

app.use("*", secureHeaders());
app.use("*", cors({
  origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));
// Bulk card imports are the largest legitimate payload; 2 MB is ~10x the
// full 116-card seed bank, so real usage stays far below it.
app.use("*", bodyLimit({
  maxSize: 2 * 1024 * 1024,
  onError: (c) => c.json({ error: "Request body too large." }, 413),
}));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error." }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", auth);
app.route("/cards", cardsRoute);
app.route("/seen", seenRoute);
app.route("/settings", settingsRoute);
app.route("/export", exportRoute);

const port = Number(process.env.PORT) || 8787;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`zitie api listening on http://localhost:${info.port}`);
});
