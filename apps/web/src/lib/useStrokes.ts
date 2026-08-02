import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { CharacterStrokes } from "./strokes";

/* Stroke geometry for one character, fetched once and then kept.

   Two layers of cache, for two different reasons. The in-memory map means
   flipping back and forth between two cards in a session is free. localStorage
   means a character you have practised is still practisable on a train — the
   geometry is a couple of kilobytes and never changes, so it is exactly the
   kind of thing worth holding onto. */

const KEY = "zitie-strokes";
const MAX_CACHED = 300;   // ~600 KB at a couple of KB each

const memory = new Map<string, CharacterStrokes | null>();

function readStore(): Record<string, CharacterStrokes> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, CharacterStrokes>;
  } catch {
    return {};
  }
}

function writeStore(hanzi: string, value: CharacterStrokes): void {
  try {
    const store = readStore();
    store[hanzi] = value;
    const keys = Object.keys(store);
    // Oldest-inserted go first. Crude, but the access pattern is "the cards I'm
    // studying now", so recency and insertion order line up closely enough.
    if (keys.length > MAX_CACHED) {
      for (const key of keys.slice(0, keys.length - MAX_CACHED)) delete store[key];
    }
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // A full quota is not worth failing a study session over.
  }
}

export type StrokeState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: CharacterStrokes }
  /** Fetched, but this character has no geometry — brush mode goes freehand. */
  | { status: "absent"; data: null };

/**
 * Geometry for every character of a card, in written order.
 *
 * A word is written one character at a time — 咖啡 is 咖 then 啡 — so brush
 * mode needs a sheet per character, and the card's proof is the whole set.
 * Characters with no geometry are still returned, as "absent": the pad falls
 * back to freehand for those rather than the card becoming unwritable.
 */
export function useStrokeSet(hanzi: string | undefined): StrokeState[] {
  const chars = useMemo(() => [...(hanzi ?? "")], [hanzi]);
  const [states, setStates] = useState<StrokeState[]>(
    () => chars.map(() => ({ status: "loading", data: null })),
  );

  useEffect(() => {
    if (!chars.length) { setStates([]); return; }
    let live = true;
    const settle = (next: StrokeState[]) => { if (live) setStates(next); };

    const cached = chars.map((ch) => resolveCached(ch));
    settle(cached);

    const wanted = chars.filter((ch, i) => cached[i].status === "loading");
    if (!wanted.length) return;

    api.getStrokes([...new Set(wanted)])
      .then(({ strokes }) => {
        for (const ch of wanted) {
          const found = strokes[ch];
          if (found?.medians?.length) {
            memory.set(ch, found);
            writeStore(ch, found);
          } else {
            memory.set(ch, null);   // remember the miss; don't re-ask every card
          }
        }
        settle(chars.map((ch) => resolveCached(ch, true)));
      })
      .catch(() => {
        // Offline and not cached: freehand rather than a blocked session.
        settle(chars.map((ch) => {
          const hit = resolveCached(ch);
          return hit.status === "loading" ? { status: "absent", data: null } : hit;
        }));
      });

    return () => { live = false; };
  }, [chars]);

  return states;
}

/** What the caches already know about one character. */
function resolveCached(hanzi: string, settled = false): StrokeState {
  if (memory.has(hanzi)) {
    const hit = memory.get(hanzi)!;
    return hit ? { status: "ready", data: hit } : { status: "absent", data: null };
  }
  const stored = readStore()[hanzi];
  if (stored) {
    memory.set(hanzi, stored);
    return { status: "ready", data: stored };
  }
  return settled ? { status: "absent", data: null } : { status: "loading", data: null };
}

export function useStrokes(hanzi: string | undefined): StrokeState {
  const [state, setState] = useState<StrokeState>({ status: "loading", data: null });

  useEffect(() => {
    if (!hanzi) { setState({ status: "absent", data: null }); return; }

    if (memory.has(hanzi)) {
      const hit = memory.get(hanzi)!;
      setState(hit ? { status: "ready", data: hit } : { status: "absent", data: null });
      return;
    }
    const stored = readStore()[hanzi];
    if (stored) {
      memory.set(hanzi, stored);
      setState({ status: "ready", data: stored });
      return;
    }

    let live = true;
    setState({ status: "loading", data: null });
    api.getStrokes([hanzi])
      .then(({ strokes }) => {
        if (!live) return;
        const found = strokes[hanzi];
        if (found?.medians?.length) {
          memory.set(hanzi, found);
          writeStore(hanzi, found);
          setState({ status: "ready", data: found });
        } else {
          // Remember the miss too — a compound word has no stroke data and
          // shouldn't be re-requested every time its card comes up.
          memory.set(hanzi, null);
          setState({ status: "absent", data: null });
        }
      })
      .catch(() => {
        // Offline and not cached: freehand rather than a blocked session.
        if (live) setState({ status: "absent", data: null });
      });
    return () => { live = false; };
  }, [hanzi]);

  return state;
}
