import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import App from "../App";
import { C, FONT_CSS } from "../theme";

type Status = "checking" | "guest" | "authed";

export function AuthGate() {
  const [status, setStatus] = useState<Status>("checking");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.me().then(
      () => setStatus("authed"),
      () => setStatus("guest"),
    );
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") await api.signup(email, password);
      else await api.login(email, password);
      setStatus("authed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    api.logout().finally(() => {
      setEmail("");
      setPassword("");
      setStatus("guest");
    });
  }

  if (status === "checking") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: C.ink, color: C.paper }}>
        <style>{FONT_CSS}</style>
        <div className="ui text-xs" style={{ color: C.faint }}>loading…</div>
      </div>
    );
  }

  if (status === "authed") {
    return <App onLogout={logout} />;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: C.ink, color: C.paper }}>
      <style>{FONT_CSS}</style>
      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-5">
        <div className="text-center">
          <div className="hz text-3xl font-black tracking-wide" style={{ color: C.paper }}>字帖</div>
          <div className="ui text-xs uppercase tracking-widest mt-1" style={{ color: C.faint }}>character study</div>
        </div>

        <div className="flex gap-2 justify-center">
          <button type="button" onClick={() => setMode("login")}
            className="ui px-3 py-1 text-xs tracking-wide rounded-full border"
            style={{ borderColor: mode === "login" ? C.paper : C.line, color: mode === "login" ? C.ink : C.dim, background: mode === "login" ? C.paper : "transparent" }}>
            Log in
          </button>
          <button type="button" onClick={() => setMode("signup")}
            className="ui px-3 py-1 text-xs tracking-wide rounded-full border"
            style={{ borderColor: mode === "signup" ? C.paper : C.line, color: mode === "signup" ? C.ink : C.dim, background: mode === "signup" ? C.paper : "transparent" }}>
            Sign up
          </button>
        </div>

        <input
          type="email" required autoComplete="email" placeholder="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="ui w-full px-4 py-3 text-sm rounded border bg-transparent"
          style={{ borderColor: C.line, color: C.paper }}
        />
        <input
          type="password" required minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder="password (min 8 characters)"
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="ui w-full px-4 py-3 text-sm rounded border bg-transparent"
          style={{ borderColor: C.line, color: C.paper }}
        />

        {error && <div className="ui text-xs" style={{ color: C.cinnabar }}>{error}</div>}

        <button type="submit" disabled={busy}
          className="ui px-6 py-3 text-xs tracking-widest uppercase border rounded"
          style={{ borderColor: C.paper, color: C.paper, opacity: busy ? 0.5 : 1 }}>
          {busy ? "please wait…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>
    </div>
  );
}
