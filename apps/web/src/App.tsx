import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./api/client";
import { type Filters } from "./lib/filters";
import { ApiStorage } from "./storage/apiStorage";
import { applyTheme, C, FONT_CSS } from "./theme";
import type { Card, SeenMap, SyncState, Theme } from "./types";
import { BrowseView } from "./views/BrowseView";
import { GalleryView } from "./views/GalleryView";
import { ImportView } from "./views/ImportView";
import { StudyView } from "./views/StudyView";

const DEFAULT_POS = ["noun", "verb", "pronoun", "adjective", "adverb", "measure word", "particle"];

export default function App({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const [bank, setBank] = useState<Card[]>([]);
  const [srs, setSrs] = useState<SeenMap>({});
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"study" | "gallery" | "browse" | "import">("study");
  const [filters, setFilters] = useState<Filters>({ q: "", pos: [], includeCompound: false, age: "all", starred: false });
  const [syncState, setSyncState] = useState<SyncState>("syncing");
  const [theme, setTheme] = useState<Theme>("light");
  const [stack, setStack] = useState<string[]>([]);
  // A "study this stack" request from Browse. nonce changes on every request so
  // StudyView can auto-begin exactly once per click, even if the ids are unchanged.
  const [stackSession, setStackSession] = useState<{ ids: string[]; nonce: number } | null>(null);

  const storageRef = useRef<ApiStorage | null>(null);
  if (!storageRef.current) storageRef.current = new ApiStorage(setSyncState);
  const storage = storageRef.current;

  useEffect(() => {
    (async () => {
      try {
        const { bank: b, srs: s, theme: t, stack: st } = await storage.load();
        applyTheme(t); setTheme(t);
        setBank(b); setSrs(s); setStack(st); setLoaded(true);
      } catch (err) {
        if (err instanceof ApiError) onLogout(); // session expired server-side
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the offline cache warm on every change, regardless of which action caused it.
  useEffect(() => {
    if (loaded) storage.cacheSnapshot(bank, srs, theme, stack);
  }, [bank, srs, theme, stack, loaded, storage]);

  function toggleTheme() {
    const t: Theme = theme === "light" ? "dark" : "light";
    applyTheme(t);
    setTheme(t);
    storage.setTheme(t).catch(() => {});
  }

  const posList = useMemo(() => {
    const s = new Set(DEFAULT_POS);
    bank.forEach(c => c.pos.forEach(p => s.add(p)));
    return [...s];
  }, [bank]);

  const onSeen = (id: string) => {
    const prev = srs[id] || { views: 0, last: 0 };
    setSrs({ ...srs, [id]: { last: Date.now(), views: (prev.views || 0) + 1 } }); // optimistic
    storage.markSeen(id).then(rec => {
      if (rec) setSrs(s => ({ ...s, [id]: rec })); // reconcile with server truth
    }).catch(() => {});
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

  const onStudyStack = () => {
    const existing = new Set(bank.map(c => c.id));
    const ids = stack.filter(id => existing.has(id));
    if (!ids.length) return;
    setStackSession({ ids, nonce: Date.now() });
    setTab("study");
  };

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

  const syncLabel = syncState === "offline" ? "offline — cached locally"
    : syncState === "syncing" ? "syncing…" : "✓ synced";

  return (
    <div className="min-h-screen w-full" style={{ background: C.ink, color: C.paper }}>
      <style>{FONT_CSS}</style>
      <div className="max-w-md mx-auto px-4 pb-24 pt-6">
        <header className="flex items-end justify-between mb-6">
          <div>
            <div className="hz text-2xl font-black tracking-wide" style={{ color: C.paper }}>字帖</div>
            <div className="ui text-xs uppercase tracking-widest mt-1" style={{ color: C.faint }}>character study</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {userEmail && (
              <div className="ui text-xs max-w-[180px] truncate" style={{ color: C.dim }} title={userEmail}>
                {userEmail}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={toggleTheme} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
                className="px-2 py-1 rounded border flex items-center gap-1"
                style={{ borderColor: C.line, color: C.dim }}>
                <span className="hz text-sm leading-none">{theme === "light" ? "暗" : "明"}</span>
                <span className="ui text-xs uppercase tracking-widest">{theme === "light" ? "dark" : "light"}</span>
              </button>
              <button onClick={onLogout}
                className="px-2 py-1 rounded border ui text-xs uppercase tracking-widest"
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
        ) : (
          <>
            {tab === "study" && <StudyView bank={bank} srs={srs} filters={filters} setFilters={setFilters} posList={posList} onSeen={onSeen} onToggleStar={onToggleStar} stackSession={stackSession} onExitStackSession={() => setStackSession(null)} stack={stack} onStudyStack={onStudyStack} />}
            {tab === "gallery" && <GalleryView bank={bank} srs={srs} onToggleStar={onToggleStar} />}
            {tab === "browse" && <BrowseView bank={bank} srs={srs} filters={filters} setFilters={setFilters} posList={posList} onDelete={onDelete} onDeleteMany={onDeleteMany} onClearAll={onClearAll} onResetSeen={onResetSeen} onToggleStar={onToggleStar} stack={stack} onAddToStack={onAddToStack} onRemoveFromStack={onRemoveFromStack} onClearStack={onClearStack} onStudyStack={onStudyStack} />}
            {tab === "import" && <ImportView bank={bank} onImport={onImport} />}
          </>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0" style={{ background: C.ink2, borderTop: `1px solid ${C.line}` }}>
        <div className="max-w-md mx-auto flex">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 py-3 flex flex-col items-center gap-1"
              style={{ color: tab === t.id ? C.paper : C.faint }}>
              <span className="hz text-lg leading-none">{t.zh}</span>
              <span className="ui text-xs uppercase tracking-widest">{t.en}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
