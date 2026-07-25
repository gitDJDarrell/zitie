import type { Card, SeenMap, Theme } from "../types";

const KEY = "zitie-cache";

export interface CachedBank {
  bank: Card[];
  srs: SeenMap;
  theme: Theme;
  stack: string[];
  // Absent in caches written before these settings existed — callers default.
  autoSpeak?: boolean;
  difficulty?: number;
}

export function readCache(): CachedBank | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // localStorage unavailable (private mode, etc.) — memory-only for this session
  }
}

export function writeCache(data: CachedBank): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // best-effort only
  }
}
