import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedOrigins, originChecker } from "./origins.js";

describe("allowedOrigins", () => {
  it("always admits the Capacitor shells, so the mobile app works", () => {
    const list = allowedOrigins("https://zitie.vercel.app");
    assert.ok(list.includes("capacitor://localhost"));
    assert.ok(list.includes("http://localhost"));
    assert.ok(list.includes("https://localhost"));
  });

  it("takes a comma-separated list, so preview and production both work", () => {
    const list = allowedOrigins("https://zitie.vercel.app, https://zitie-git-x.vercel.app");
    assert.ok(list.includes("https://zitie.vercel.app"));
    assert.ok(list.includes("https://zitie-git-x.vercel.app"));
  });

  it("tolerates the trailing slash you get from copying the address bar", () => {
    assert.ok(allowedOrigins("https://zitie.vercel.app/").includes("https://zitie.vercel.app"));
  });

  it("falls back to the Vite dev server when unset or empty", () => {
    assert.ok(allowedOrigins(undefined).includes("http://localhost:5173"));
    assert.ok(allowedOrigins("").includes("http://localhost:5173"));
    assert.ok(allowedOrigins("  ,  ").includes("http://localhost:5173"));
  });

  it("does not repeat an entry that is already a shell", () => {
    const list = allowedOrigins("http://localhost");
    assert.equal(list.filter((o) => o === "http://localhost").length, 1);
  });
});

describe("originChecker", () => {
  const check = originChecker(["https://zitie.vercel.app", "capacitor://localhost"]);

  it("echoes an allowed origin", () => {
    assert.equal(check("https://zitie.vercel.app"), "https://zitie.vercel.app");
    assert.equal(check("capacitor://localhost"), "capacitor://localhost");
  });

  it("denies anything else", () => {
    assert.equal(check("https://evil.example"), undefined);
    // A look-alike on the same shared host is exactly what patterns would let
    // through, and cookies ride on these requests.
    assert.equal(check("https://zitie-evil.vercel.app"), undefined);
  });

  it("lets through a caller with no Origin header at all", () => {
    // curl, a platform health check, a native fetch — nothing to police.
    assert.equal(check(undefined), "https://zitie.vercel.app");
  });
});
