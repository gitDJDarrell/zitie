import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Files under public/ that belong in the offline shell. The hashed JS/CSS come
// from the bundle itself; these don't pass through it.
const STATIC_SHELL = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  "/apple-touch-icon.png",
];

// Emits dist/sw.js from sw-template.js with the real precache list baked in.
// Build-only: there is no service worker in dev, where an aggressive shell
// cache would just fight HMR.
function serviceWorker(): Plugin {
  return {
    name: "zitie-service-worker",
    apply: "build",
    writeBundle(options, bundle) {
      const emitted = Object.keys(bundle).map((file) => `/${file}`);
      const precache = ["/", ...emitted, ...STATIC_SHELL];
      // Version = hash of what's being cached, so a deploy that changes any
      // file gets a new cache name and the old one is dropped on activate.
      const version = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);

      const template = readFileSync(fileURLToPath(new URL("./sw-template.js", import.meta.url)), "utf8");
      writeFileSync(
        join(options.dir ?? "dist", "sw.js"),
        template.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache)),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { port: 5173 },
});
