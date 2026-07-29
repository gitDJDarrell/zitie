import { useEffect, useState } from "react";
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
