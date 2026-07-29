/**
 * Which browser origins may call this API with credentials.
 *
 * `WEB_ORIGIN` takes a comma-separated list rather than a single URL, because
 * a real deploy has more than one front door: production, a staging or preview
 * URL, and later a custom domain alongside the provider subdomain. A single
 * slot forces you to keep re-pointing it and to break whichever one you aren't
 * currently testing.
 *
 * Deliberately exact strings, never patterns. Cookies are sent with these
 * requests, so a wildcard like `*.vercel.app` would let any app on that
 * shared domain make credentialed calls on a logged-in user's behalf. Adding
 * a preview URL by hand is the small price for that not being possible.
 */
const NATIVE_SHELLS = [
  // Android serves the Capacitor app from http(s)://localhost, iOS from
  // capacitor://localhost — the mobile app's calls have to pass CORS too.
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
];

const DEV_DEFAULT = "http://localhost:5173";

export function allowedOrigins(webOrigin: string | undefined = process.env.WEB_ORIGIN): string[] {
  const configured = (webOrigin ?? "")
    .split(",")
    .map(normalize)
    .filter(Boolean);
  return [...new Set([...(configured.length ? configured : [DEV_DEFAULT]), ...NATIVE_SHELLS])];
}

/**
 * A browser's `Origin` header is scheme + host + port, never a trailing slash
 * or a path. Pasting a URL straight out of the address bar gets you
 * "https://x.vercel.app/", which would then match nothing at all and produce
 * a CORS failure with no clue as to why — so trim it here rather than making
 * someone find it.
 */
function normalize(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** The cors() origin callback: echo the origin when it's allowed, else deny. */
export function originChecker(origins: string[] = allowedOrigins()) {
  return (origin: string | undefined): string | undefined => {
    // No Origin header at all means a same-origin or non-browser caller
    // (curl, the health check, a native fetch) — nothing to police.
    if (!origin) return origins[0];
    return origins.includes(normalize(origin)) ? origin : undefined;
  };
}
