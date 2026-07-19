import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./routes/auth.js";
import { cardsRoute } from "./routes/cards.js";
import { exportRoute } from "./routes/export.js";
import { seenRoute } from "./routes/seen.js";
import { settingsRoute } from "./routes/settings.js";

const app = new Hono();

app.use("*", cors({
  origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));

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
