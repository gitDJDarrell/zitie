import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, type Profile, type ProfilePatch } from "./api/client";
import { type Filters } from "./lib/filters";
import { initSpeech } from "./lib/speech";
import { ApiStorage } from "./storage/apiStorage";
import { applyTheme, C, FONT_CSS } from "./theme";
import type { Card, Grade, Proof, SeenMap, SeenRecord, SyncState, Theme } from "./types";
import { BrowseView } from "./views/BrowseView";
import { GalleryView } from "./views/GalleryView";
import { ImportView } from "./views/ImportView";
import { isCollected, isMastered, MASTERY_MARKS } from "./lib/srs";
import { EarnedBanner } from "./components/EarnedBanner";
import { MasteredBanner } from "./components/MasteredBanner";
import { StudyView, type StackSession } from "./views/StudyView";
import { ExamView } from "./views/ExamView";
import { ProfileView } from "./views/ProfileView";

const DEFAULT_POS = ["noun", "verb", "pronoun", "adjective", "adverb", "measure word", "particle"];

export default function App({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const [bank, setBank] = useState<Card[]>([]);
  const [srs, setSrs] = useState<SeenMap>({});
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"study" | "gallery" | "browse" | "import">("study");
  const [filters, setFilters] = useState<Filters>({ q: "", pos: [], includeCompound: false, age: "all", starred: false });
  const [syncState, setSyncState] = useState<SyncState>("syncing");
  // Writes waiting for the network. Shown in the header so an offline session
  // reads as "held, not lost" — the difference between trusting the app on a
  // train and re-grading everything afterwards.
  const [pending, setPending] = useState(0);
  const [theme, setTheme] = useState<Theme>("light");
  const [stack, setStack] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState(2);
  // A "study this stack" request from Browse. nonce changes on every request so
  // StudyView can auto-begin exactly once per click, even if the ids are unchanged.
  const [stackSession, setStackSession] = useState<StackSession | null>(null);
  // The character whose dex slot was just earned, shown as a one-off reward.
  const [earned, setEarned] = useState<Card | null>(null);
  // The character just mastered in the 考 exam — a louder, rarer reward than
  // collection, so it gets its own banner over the top of the app.
  const [mastered, setMastered] = useState<Card | null>(null);
  // The 考 exam is running as its own full-screen flow, outside the tab bar.
  const [examing, setExaming] = useState(false);
  // The account's profile — loaded on start so the header can show the avatar,
  // opened as an overlay from the header.
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // A study deck is running: the account chrome steps aside so the session
  // has the room — and the quiet — to itself.
  const [sessionActive, setSessionActive] = useState(false);

  const storageRef = useRef<ApiStorage | null>(null);
  if (!storageRef.current) storageRef.current = new ApiStorage(setSyncState, setPending);
  const storage = storageRef.current;

  useEffect(() => {
    initSpeech(); // voice lists load async — warm it before the first reveal
    (async () => {
      try {
        const { bank: b, srs: s, theme: t, stack: st, difficulty: d } = await storage.load();
        applyTheme(t); setTheme(t);
        setBank(b); setSrs(s); setStack(st); setDifficulty(d); setLoaded(true);
      } catch (err) {
        if (err instanceof ApiError) onLogout(); // session expired server-side
      }
      // Profile is best-effort: a header avatar is nice-to-have, and offline it
      // simply isn't there. Never let it block or fail the bank load.
      api.getProfile().then(setProfile).catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the offline cache warm on every change, regardless of which action caused it.
  useEffect(() => {
    if (loaded) storage.cacheSnapshot(bank, srs, theme, stack, difficulty);
  }, [bank, srs, theme, stack, difficulty, loaded, storage]);

  function toggleTheme() {
    const t: Theme = theme === "light" ? "dark" : "light";
    applyTheme(t);
    setTheme(t);
    storage.setTheme(t).catch(() => {});
  }

  // Save a profile edit. Throws ApiError (e.g. a taken username) straight to the
  // ProfileView, which shows it inline; on success the server's canonical row
  // replaces ours.
  async function onSaveProfile(patch: ProfilePatch) {
    const updated = await api.updateProfile(patch);
    setProfile(updated);
  }

  const posList = useMemo(() => {
    const s = new Set(DEFAULT_POS);
    bank.forEach(c => c.pos.forEach(p => s.add(p)));
    return [...s];
  }, [bank]);

  const onSeen = (id: string) => {
    const prev = srs[id] || { views: 0, last: 0 };
    // Optimistic view bump — preserve any existing scheduling state, since a
    // raw view never reschedules (only grading does).
    setSrs({ ...srs, [id]: { ...prev, last: Date.now(), views: (prev.views || 0) + 1 } });
    storage.markSeen(id).then(rec => {
      if (rec) setSrs(s => ({ ...s, [id]: rec })); // reconcile with server truth
    }).catch(() => {});
  };

  // Self-rating drives the scheduler. The server owns the real interval maths,
  // so this only bumps the view count locally and then takes the server's word.
  //
  // `proof` rides along when the answer was right: two of them, one each
  // direction, is what earns the character its dex slot. The optimistic state
  // records it too, so an offline session still lights the dex up — the queued
  // grade carries the same proof and the server agrees when it drains.
  const onGrade = (id: string, grade: Grade, proof?: Proof, exam?: boolean) => {
    const prev = srs[id] || { views: 0, last: 0 };
    const readOk = prev.readOk || proof === "read";
    const writeOk = prev.writeOk || proof === "write";
    const brushOk = prev.brushOk || proof === "brush";
    // A mark banks only on a clean exam pass of an already-collected card —
    // mirrors the server, capped so a direction can't overrun. `bump` decides
    // which counter, if any, moves.
    const collected = readOk && writeOk && brushOk;
    const banks = !!exam && grade !== "again" && collected;
    const bump = (n: number | undefined, on: boolean) =>
      Math.min(MASTERY_MARKS, (n || 0) + (on ? 1 : 0));
    const optimistic: SeenRecord = {
      ...prev, last: Date.now(), views: (prev.views || 0) + 1,
      readOk, writeOk, brushOk,
      readMarks: bump(prev.readMarks, banks && proof === "read"),
      writeMarks: bump(prev.writeMarks, banks && proof === "write"),
      brushMarks: bump(prev.brushMarks, banks && proof === "brush"),
    };
    setSrs(s => ({ ...s, [id]: optimistic }));
    announceIfEarned(id, prev, optimistic);
    storage.gradeCard(id, grade, proof, exam).then(rec => {
      if (!rec) return;
      setSrs(s => ({ ...s, [id]: rec }));
      announceIfEarned(id, optimistic, rec); // in case the server knew something we didn't
    }).catch(() => {});
  };

  // The reward moments. Each is raised exactly once per character: collection
  // when the third proof lands (a dex slot filling), mastery when the ninth
  // exam mark lands (the card turning shiny) — an event you witness, not a row
  // that was always quietly there. Mastery outranks collection: a single grade
  // never crosses both bars, but if it somehow did, the louder banner wins.
  const onCollectedAnnounced = useRef(new Set<string>());
  const onMasteredAnnounced = useRef(new Set<string>());
  function announceIfEarned(id: string, before: SeenRecord, after: SeenRecord) {
    const card = bank.find(c => c.id === id);
    if (!isMastered(before) && isMastered(after) && !onMasteredAnnounced.current.has(id)) {
      onMasteredAnnounced.current.add(id);
      if (card) { setMastered(card); return; }
    }
    if (!isCollected(before) && isCollected(after) && !onCollectedAnnounced.current.has(id)) {
      onCollectedAnnounced.current.add(id);
      if (card) setEarned(card);
    }
  }

  const onSetDifficulty = (d: number) => {
    setDifficulty(d);
    storage.setDifficulty(d).catch(() => {});
  };

  const onImport = async (items: unknown[]) => {
    const { cards, added, updated } = await storage.importCards(items); // server computes the merge
    setBank(cards);
    return { added, updated };
  };

  const onDelete = (id: string) => {
    setBank(b => b.filter(c => c.id !== id));
    setSrs(s => { const { [id]: _drop, ...rest } = s; return rest; });
    setStack(st => st.includes(id) ? st.filter(x => x !== id) : st);
    storage.deleteCards([id]).catch(() => {});
  };

  const onDeleteMany = (ids: string[]) => {
    const drop = new Set(ids);
    setBank(b => b.filter(c => !drop.has(c.id)));
    setSrs(s => Object.fromEntries(Object.entries(s).filter(([k]) => !drop.has(k))));
    setStack(st => st.filter(id => !drop.has(id)));
    storage.deleteCards(ids).catch(() => {});
  };

  const onClearAll = () => {
    setBank([]); setSrs({}); setStack([]);
    storage.clearAll().catch(() => {});
  };

  // Stack: a user-curated, order-preserving preselection for a future study
  // session. Independent of starring (see BrowseView) — a card can be starred
  // ("tricky, keep reviewing forever") without being in the stack ("study
  // these specific N next"), and vice versa.
  const onAddToStack = (ids: string[]) => {
    setStack(st => {
      const have = new Set(st);
      const additions = ids.filter(id => !have.has(id));
      if (!additions.length) return st;
      const next = [...st, ...additions];
      storage.setStack(next).catch(() => {});
      return next;
    });
  };

  const onRemoveFromStack = (ids: string[]) => {
    const drop = new Set(ids);
    setStack(st => {
      const next = st.filter(id => !drop.has(id));
      if (next.length === st.length) return st;
      storage.setStack(next).catch(() => {});
      return next;
    });
  };

  const onClearStack = () => {
    setStack([]);
    storage.setStack([]).catch(() => {});
  };

  // Study a specific set of cards right now, without touching the saved
  // stack. The dex uses this for "study this level" — a one-off session, not
  // an edit to the list the user curated in Browse. `origin` is what the study
  // screen calls the run, so a dex selection doesn't present itself as the
  // stack; omitted means it *is* the stack.
  const onStudyIds = (ids: string[], origin?: StackSession["origin"]) => {
    const existing = new Set(bank.map(c => c.id));
    const use = ids.filter(id => existing.has(id));
    if (!use.length) return;
    setStackSession({ ids: use, nonce: Date.now(), origin });
    setTab("study");
  };

  const onStudyStack = () => onStudyIds(stack);

  const onToggleStar = (id: string) => {
    const card = bank.find(c => c.id === id);
    setBank(b => b.map(c => c.id === id ? { ...c, starred: !c.starred } : c));
    storage.patchCard(id, { starred: !card?.starred }).catch(() => {});
  };

  const onResetSeen = (ids: string[] | null) => {
    if (!ids) {
      setSrs({});
    } else {
      const drop = new Set(ids);
      setSrs(s => Object.fromEntries(Object.entries(s).filter(([k]) => !drop.has(k))));
    }
    storage.resetSeen(ids).catch(() => {});
  };

  const TABS = [
    { id: "study" as const, zh: "学", en: "Study" },
    { id: "gallery" as const, zh: "鉴", en: "Gallery" },
    { id: "browse" as const, zh: "查", en: "Browse" },
    { id: "import" as const, zh: "入", en: "Import" },
  ];

  const syncLabel = syncState === "offline"
      ? (pending ? `offline — ${pending} waiting to sync` : "offline — cached locally")
    : syncState === "syncing" ? "syncing…"
    : pending ? `${pending} waiting to sync` : "✓ synced";

  return (
    <div className="min-h-screen w-full" style={{ background: C.ink, color: C.paper }}>
      <style>{FONT_CSS}</style>
      <div className="max-w-md mx-auto" style={{
        // Clear the notch up top and the fixed nav + home indicator at the
        // bottom; keep a sensible min side padding in landscape.
        paddingTop: "calc(1.5rem + env(safe-area-inset-top))",
        paddingBottom: "calc(6rem + env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}>
        <header className="flex items-end justify-between mb-6"
          style={sessionActive ? { display: "none" } : undefined}>
          <div>
            <div className="hz text-2xl font-black tracking-wide" style={{ color: C.paper }}>字帖</div>
            <div className="ui t-label mt-1" style={{ color: C.faint }}>character study</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 max-w-[200px]"
              aria-label="Open your profile" title="Your profile">
              <span className="rounded-full overflow-hidden shrink-0 flex items-center justify-center"
                style={{ width: 24, height: 24, background: C.ink3, border: `1px solid ${C.line}` }}>
                {profile?.avatar
                  ? <img src={profile.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span className="hz" style={{ fontSize: 12, color: C.dim }}>
                      {(profile?.username || userEmail || "?").trim().charAt(0).toUpperCase()}
                    </span>}
              </span>
              <span className="ui text-xs truncate" style={{ color: C.dim }}>
                {profile?.username || userEmail}
              </span>
            </button>
            <div className="flex items-center gap-2">
              <button onClick={toggleTheme} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
                className="px-2 py-1 rounded border flex items-center gap-1"
                style={{ borderColor: C.line, color: C.dim }}>
                <span className="hz text-sm leading-none">{theme === "light" ? "暗" : "明"}</span>
                <span className="ui t-label">{theme === "light" ? "dark" : "light"}</span>
              </button>
              <button onClick={onLogout}
                className="px-2 py-1 rounded border ui t-label"
                style={{ borderColor: C.line, color: C.dim }}>
                Log out
              </button>
            </div>
            <div className="ui text-xs" style={{ color: C.faint }}>{bank.length} in bank</div>
            <div className="ui text-xs" style={{ color: syncState === "offline" ? C.cinnabar : C.faint }}>
              {syncLabel}
            </div>
          </div>
        </header>

        {!loaded ? (
          <div className="ui text-xs pt-10 text-center" style={{ color: C.faint }}>loading…</div>
        ) : examing ? (
          <ExamView bank={bank} srs={srs} onGrade={onGrade} onToggleStar={onToggleStar}
            onExit={() => { setExaming(false); setSessionActive(false); }}
            onSessionActive={setSessionActive} />
        ) : (
          <>
            {tab === "study" && <StudyView bank={bank} srs={srs} filters={filters} setFilters={setFilters} posList={posList} onSeen={onSeen} onGrade={onGrade} onToggleStar={onToggleStar} stackSession={stackSession} onExitStackSession={() => setStackSession(null)} stack={stack} onStudyStack={onStudyStack} difficulty={difficulty} onSetDifficulty={onSetDifficulty} onSessionActive={setSessionActive} />}
            {tab === "gallery" && <GalleryView bank={bank} srs={srs} onToggleStar={onToggleStar} stack={stack} onAddToStack={onAddToStack} onRemoveFromStack={onRemoveFromStack} onStudyIds={onStudyIds} onStartExam={() => setExaming(true)} />}
            {tab === "browse" && <BrowseView bank={bank} srs={srs} filters={filters} setFilters={setFilters} posList={posList} onDelete={onDelete} onDeleteMany={onDeleteMany} onClearAll={onClearAll} onResetSeen={onResetSeen} onToggleStar={onToggleStar} stack={stack} onAddToStack={onAddToStack} onRemoveFromStack={onRemoveFromStack} onClearStack={onClearStack} onStudyStack={onStudyStack} />}
            {tab === "import" && <ImportView bank={bank} srs={srs} onImport={onImport} onStudyIds={onStudyIds} />}
          </>
        )}
      </div>

      {earned && <EarnedBanner card={earned} onDismiss={() => setEarned(null)} />}
      {mastered && <MasteredBanner card={mastered} onDismiss={() => setMastered(null)} />}
      {profileOpen && profile && (
        <ProfileView profile={profile} bank={bank} srs={srs}
          onSave={onSaveProfile} onClose={() => setProfileOpen(false)} />
      )}

      {!examing && (
      <nav className="fixed bottom-0 left-0 right-0" style={{
        background: C.ink2,
        borderTop: `1px solid ${C.line}`,
        paddingBottom: "env(safe-area-inset-bottom)", // sit above the home indicator
      }}>
        <div className="max-w-md mx-auto flex">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 py-3 flex flex-col items-center gap-1"
              style={{ color: tab === t.id ? C.paper : C.faint }}>
              <span className="hz text-lg leading-none">{t.zh}</span>
              <span className="ui t-label">{t.en}</span>
            </button>
          ))}
        </div>
      </nav>
      )}
    </div>
  );
}
