import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { aiRoute } from "./routes/ai.js";
import { auth } from "./routes/auth.js";
import { insightsRoute } from "./routes/insights.js";
import { cardsRoute } from "./routes/cards.js";
import { exportRoute } from "./routes/export.js";
import { seenRoute } from "./routes/seen.js";
import { settingsRoute } from "./routes/settings.js";

const app = new Hono();

app.use("*", secureHeaders());
// Allowed browser/WebView origins. Includes the deployed web origin plus the
// Capacitor native shells — Android serves the app from http(s)://localhost,
// iOS from capacitor://localhost — so the mobile app's API calls pass CORS.
const allowedOrigins = [
  process.env.WEB_ORIGIN ?? "http://localhost:5173",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
];
app.use("*", cors({
  origin: (origin) => (!origin || allowedOrigins.includes(origin) ? (origin ?? allowedOrigins[0]) : undefined),
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
app.route("/ai", aiRoute);
app.route("/insights", insightsRoute);
app.route("/cards", cardsRoute);
app.route("/seen", seenRoute);
app.route("/settings", settingsRoute);
app.route("/export", exportRoute);

const port = Number(process.env.PORT) || 8787;
// Bind all interfaces so the container's proxy (Fly) and the Android emulator
// (10.0.2.2 → host) can reach it, not just loopback.
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`zitie api listening on 0.0.0.0:${info.port}`);
});
