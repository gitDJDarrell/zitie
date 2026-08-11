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
import { strokesRoute } from "./routes/strokes.js";
import { settingsRoute } from "./routes/settings.js";
import { profileRoute } from "./routes/profile.js";
import { allowedOrigins, originChecker } from "./lib/origins.js";

const app = new Hono();

app.use("*", secureHeaders());
// Allowed browser/WebView origins: WEB_ORIGIN (a comma-separated list, so a
// preview deploy and production can both work) plus the Capacitor shells.
// See lib/origins.ts for why these stay exact strings rather than patterns.
const origins = allowedOrigins();
console.log(`[cors] allowing ${origins.join(", ")}`);
app.use("*", cors({ origin: originChecker(origins), credentials: true }));
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
app.route("/strokes", strokesRoute);
app.route("/settings", settingsRoute);
app.route("/profile", profileRoute);
app.route("/export", exportRoute);

const port = Number(process.env.PORT) || 8787;
// Bind all interfaces so the container's reverse proxy and the Android emulator
// (10.0.2.2 → host) can reach it, not just loopback.
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`zitie api listening on 0.0.0.0:${info.port}`);
});
