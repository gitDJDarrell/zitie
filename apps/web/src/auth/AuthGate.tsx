import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import App from "../App";
import { C, FONT_CSS } from "../theme";

type Status = "checking" | "guest" | "authed";
type Mode = "login" | "signup" | "forgot" | "reset";

function resetTokenFromUrl() {
  return new URLSearchParams(window.location.search).get("reset");
}

export function AuthGate() {
  const [status, setStatus] = useState<Status>("checking");
  const [mode, setMode] = useState<Mode>(() => (resetTokenFromUrl() ? "reset" : "login"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    // A reset link should always land on the reset form, even with a live session.
    if (resetTokenFromUrl()) {
      setStatus("guest");
      return;
    }
    api.me().then(
      (me) => { setUserEmail(me.email); setStatus("authed"); },
      () => setStatus("guest"),
    );
  }, []);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "forgot") {
        await api.forgotPassword(email);
        setNotice("If an account exists for that email, a reset link is on its way. It's valid for 30 minutes.");
      } else if (mode === "reset") {
        const token = resetTokenFromUrl();
        if (!token) throw new ApiError("Missing reset token — use the link from your email.", 400);
        await api.resetPassword(token, password);
        window.history.replaceState(null, "", window.location.pathname); // drop ?reset= from the URL
        setPassword("");
        switchMode("login");
        setNotice("Password updated — log in with your new password.");
      } else {
        const user = mode === "signup"
          ? await api.signup(email, password)
          : await api.login(email, password);
        setUserEmail(user.email);
        setStatus("authed");
      }
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
    return <App onLogout={logout} userEmail={userEmail} />;
  }

  const showEmail = mode !== "reset";
  const showPassword = mode !== "forgot";
  const submitLabel = mode === "signup" ? "Create account"
    : mode === "forgot" ? "Send reset link"
    : mode === "reset" ? "Set new password"
    : "Log in";

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: C.ink, color: C.paper }}>
      <style>{FONT_CSS}</style>
      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-5">
        <div className="text-center">
          <div className="hz text-3xl font-black tracking-wide" style={{ color: C.paper }}>字帖</div>
          <div className="ui t-label mt-1" style={{ color: C.faint }}>character study</div>
        </div>

        {mode === "reset" ? (
          <div className="ui t-body text-center" style={{ color: C.dim }}>
            Choose a new password for your account.
          </div>
        ) : (
          <div className="flex gap-2 justify-center">
            <button type="button" onClick={() => switchMode("login")}
              className="ui px-3 py-1 text-xs tracking-wide rounded-full border"
              style={{ borderColor: mode === "login" ? C.paper : C.line, color: mode === "login" ? C.ink : C.dim, background: mode === "login" ? C.paper : "transparent" }}>
              Log in
            </button>
            <button type="button" onClick={() => switchMode("signup")}
              className="ui px-3 py-1 text-xs tracking-wide rounded-full border"
              style={{ borderColor: mode === "signup" ? C.paper : C.line, color: mode === "signup" ? C.ink : C.dim, background: mode === "signup" ? C.paper : "transparent" }}>
              Sign up
            </button>
          </div>
        )}

        {showEmail && (
          <input
            type="email" required autoComplete="email" placeholder="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="ui w-full px-4 py-3 text-sm rounded border bg-transparent"
            style={{ borderColor: C.line, color: C.paper }}
          />
        )}
        {showPassword && (
          <input
            type="password" required minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "reset" ? "new password (min 8 characters)" : "password (min 8 characters)"}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="ui w-full px-4 py-3 text-sm rounded border bg-transparent"
            style={{ borderColor: C.line, color: C.paper }}
          />
        )}

        {error && <div className="ui text-xs" style={{ color: C.cinnabar }}>{error}</div>}
        {notice && <div className="ui text-xs" style={{ color: C.dim }}>{notice}</div>}

        <button type="submit" disabled={busy}
          className="ui px-6 py-3 t-btn border rounded"
          style={{ borderColor: C.paper, color: C.paper, opacity: busy ? 0.5 : 1 }}>
          {busy ? "please wait…" : submitLabel}
        </button>

        {mode === "login" && (
          <button type="button" onClick={() => switchMode("forgot")}
            className="ui text-xs text-center" style={{ color: C.faint }}>
            forgot password?
          </button>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <button type="button"
            onClick={() => {
              if (mode === "reset") window.history.replaceState(null, "", window.location.pathname);
              switchMode("login");
            }}
            className="ui text-xs text-center" style={{ color: C.faint }}>
            back to log in
          </button>
        )}
      </form>
    </div>
  );
}
