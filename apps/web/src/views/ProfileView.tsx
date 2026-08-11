import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, type Profile, type ProfilePatch } from "../api/client";
import { DEX_INDEX, DEX_TOTAL } from "../data/dex";
import { WORD_INDEX, WORD_TOTAL } from "../data/wordDex";
import { isCollected, isMastered } from "../lib/srs";
import { rankFor } from "../lib/rank";
import { C } from "../theme";
import type { Card, SeenMap } from "../types";

/* ————————————————— 个人 the profile —————————————————
   Who you are on this device, and how far the collection has come. Opened from
   the header. Identity fields are editable; the two stats — how much of the dex
   you've filled, and your 考 exam rank — are earned, read-only, and the reason
   to keep coming back. */

const AVATAR_PX = 256; // downscale target — a profile picture, not a photo

/** Load a picked file, cover-crop to a square, and return a compact data URI. */
function resizeToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = AVATAR_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Couldn't process that image."));
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't a readable image.")); };
    img.src = url;
  });
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
function fmtSeen(ms: number | null): string {
  if (!ms) return "—";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return fmtDate(ms);
}

export function ProfileView({ profile, bank, srs, onSave, onClose }: {
  profile: Profile;
  bank: Card[]; srs: SeenMap;
  onSave: (patch: ProfilePatch) => Promise<void>;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(profile.username ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-sync when the server hands back a fresh profile (e.g. after an avatar
  // save), so the fields never drift from the source of truth.
  useEffect(() => {
    setUsername(profile.username ?? ""); setPhone(profile.phone ?? ""); setBio(profile.bio ?? "");
  }, [profile.username, profile.phone, profile.bio]);

  const dirty =
    username !== (profile.username ?? "") ||
    phone !== (profile.phone ?? "") ||
    bio !== (profile.bio ?? "");

  // Collection standing, computed the same way the gallery counts it: a slot is
  // filled by proving the character, not by owning a card for it.
  const { charPct, wordPct, charDone, wordDone, mastered } = useMemo(() => {
    const byHanzi = new Map(bank.map(c => [c.hanzi, c]));
    const recFor = (h: string) => srs[byHanzi.get(h)?.id ?? ""];
    let charDone = 0, mastered = 0;
    for (const h of DEX_INDEX.keys()) {
      const rec = recFor(h);
      if (isCollected(rec)) charDone++;
      if (isMastered(rec)) mastered++;
    }
    let wordDone = 0;
    for (const w of WORD_INDEX.keys()) if (isCollected(recFor(w))) wordDone++;
    return {
      charDone, wordDone, mastered,
      charPct: DEX_TOTAL ? (charDone / DEX_TOTAL) * 100 : 0,
      wordPct: WORD_TOTAL ? (wordDone / WORD_TOTAL) * 100 : 0,
    };
  }, [bank, srs]);

  const standing = rankFor(profile.masteryRating);

  async function save(patch: ProfilePatch) {
    setBusy(true); setError(null);
    try {
      await onSave(patch);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1600);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    setError(null);
    try {
      const dataUri = await resizeToDataUri(file);
      await save({ avatar: dataUri });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that image.");
    }
  }

  const initial = (profile.username || profile.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl my-4" onClick={e => e.stopPropagation()}
        style={{ background: C.ink2, border: `1px solid ${C.line}` }}>

        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex items-baseline gap-2">
            <span className="hz text-base" style={{ color: C.dim }}>个人</span>
            <span className="ui t-label" style={{ color: C.faint }}>profile</span>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="ui text-lg px-2 leading-none" style={{ color: C.faint }}>✕</button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          {/* identity */}
          <div className="flex items-center gap-4">
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              aria-label="Change profile picture"
              className="relative rounded-full overflow-hidden shrink-0 flex items-center justify-center"
              style={{ width: 76, height: 76, background: C.ink3, border: `1px solid ${C.line}` }}>
              {profile.avatar
                ? <img src={profile.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span className="hz font-black" style={{ fontSize: 34, color: C.dim }}>{initial}</span>}
              <span className="absolute inset-x-0 bottom-0 ui text-center"
                style={{ fontSize: 9, letterSpacing: "0.1em", color: C.paper, background: "rgba(0,0,0,0.45)", padding: "1px 0" }}>
                EDIT
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} className="hidden" />
            <div className="min-w-0">
              <div className="hz text-xl font-black truncate" style={{ color: C.paper }}>
                {profile.username || "unnamed"}
              </div>
              <div className="ui text-xs truncate" style={{ color: C.faint }}>{profile.email}</div>
            </div>
          </div>

          {/* editable fields */}
          <div className="flex flex-col gap-3">
            <Field label="username" hint="letters, numbers, underscore">
              <input value={username} onChange={e => setUsername(e.target.value)}
                placeholder="pick a handle" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={24}
                className="ui w-full px-3 py-2 rounded border bg-transparent text-sm"
                style={{ borderColor: C.line, color: C.paper }} />
            </Field>
            <Field label="phone" hint="optional">
              <input value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+1 555 010 0000" inputMode="tel" maxLength={32}
                className="ui w-full px-3 py-2 rounded border bg-transparent text-sm"
                style={{ borderColor: C.line, color: C.paper }} />
            </Field>
            <Field label="bio" hint={`${bio.length} / 280`}>
              <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 280))} rows={3}
                placeholder="a line about your study"
                className="ui w-full px-3 py-2 rounded border bg-transparent text-sm resize-none"
                style={{ borderColor: C.line, color: C.paper }} />
            </Field>

            {error && <div className="ui t-meta" style={{ color: C.cinnabar }}>{error}</div>}
            <div className="flex items-center gap-3">
              <button onClick={() => save({ username, phone, bio })} disabled={!dirty || busy}
                className="ui t-btn px-5 py-2 border rounded"
                style={{ borderColor: dirty ? C.paper : C.line, color: dirty ? C.paper : C.faint, opacity: dirty && !busy ? 1 : 0.5 }}>
                {busy ? "saving…" : "Save"}
              </button>
              {savedTick && <span className="ui t-meta" style={{ color: C.dim }}>✓ saved</span>}
            </div>
          </div>

          {/* meta */}
          <div className="ui t-meta flex flex-col gap-1 pt-1" style={{ color: C.faint, borderTop: `1px solid ${C.ink3}` }}>
            <div className="pt-3">joined {fmtDate(profile.joinedAt)}</div>
            <div>last seen {fmtSeen(profile.lastSeen)}</div>
          </div>

          {/* gallery completion */}
          <div className="flex flex-col gap-3 pt-1" style={{ borderTop: `1px solid ${C.ink3}` }}>
            <div className="ui t-label pt-3" style={{ color: C.faint }}>
              <span className="hz" style={{ color: C.dim }}>图鉴</span> gallery completion
            </div>
            <Meter zh="字" label="characters" done={charDone} total={DEX_TOTAL} pct={charPct} />
            <Meter zh="词" label="words" done={wordDone} total={WORD_TOTAL} pct={wordPct} />
          </div>

          {/* mastery rank */}
          <div className="flex flex-col gap-2 pt-1" style={{ borderTop: `1px solid ${C.ink3}` }}>
            <div className="ui t-label pt-3" style={{ color: C.faint }}>
              <span className="hz" style={{ color: C.dim }}>考</span> mastery rank
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="hz text-3xl font-black leading-none" style={{ color: C.paper }}>{standing.rank.zh}</div>
                <div className="ui t-meta mt-1" style={{ color: C.dim }}>
                  <span className="mono">{standing.rank.py}</span> · {standing.rank.en}
                </div>
              </div>
              <div className="text-right">
                <div className="mono text-lg" style={{ color: C.paper }}>{standing.rating}</div>
                <div className="ui t-micro" style={{ color: C.faint }}>rating</div>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden mt-1" style={{ background: C.ink3 }} aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${Math.round(standing.progress * 100)}%`, background: C.paper }} />
            </div>
            <div className="ui t-micro" style={{ color: C.faint }}>
              {standing.next
                ? <><span style={{ color: C.dim }}>{standing.toNext}</span> to <span className="hz">{standing.next.zh}</span> {standing.next.en}</>
                : <>the top rank — {mastered} character{mastered === 1 ? "" : "s"} mastered</>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="ui t-label flex items-baseline justify-between" style={{ color: C.faint }}>
        <span>{label}</span>{hint && <span className="t-micro" style={{ color: C.faint }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Meter({ zh, label, done, total, pct }: { zh: string; label: string; done: number; total: number; pct: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between ui t-meta">
        <span style={{ color: C.dim }}><span className="hz">{zh}</span> {label}</span>
        <span style={{ color: C.faint }}>
          <span className="mono" style={{ color: C.paper }}>{done.toLocaleString()}</span> / {total.toLocaleString()} · {pct.toFixed(pct < 10 ? 1 : 0)}%
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: C.ink3 }} aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: C.paper, transition: "width 300ms ease" }} />
      </div>
    </div>
  );
}
