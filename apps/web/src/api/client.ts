import type { Card, SeenMap, Theme } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  signup: (email: string, password: string) =>
    request<{ id: string; email: string }>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<{ id: string; email: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) }),
  me: () => request<{ id: string; email: string }>("/auth/me"),

  getBank: () => request<{ cards: Card[]; seen: SeenMap }>("/cards"),
  importCards: (items: unknown[]) =>
    request<{ cards: Card[]; added: number; updated: number }>("/cards", { method: "POST", body: JSON.stringify(items) }),
  patchCard: (id: string, patch: Partial<Card>) =>
    request<Card>(`/cards/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCards: (ids: string[]) => request<{ ok: true }>("/cards", { method: "DELETE", body: JSON.stringify({ ids }) }),
  clearAll: () => request<{ ok: true }>("/cards/clear-all", { method: "POST" }),

  markSeen: (id: string) => request<{ last: number; views: number }>("/seen", { method: "POST", body: JSON.stringify({ id }) }),
  resetSeen: (ids?: string[]) => request<{ ok: true }>("/seen/reset", { method: "POST", body: JSON.stringify({ ids }) }),

  getSettings: () => request<{ theme: Theme }>("/settings"),
  setTheme: (theme: Theme) => request<{ theme: Theme }>("/settings", { method: "PATCH", body: JSON.stringify({ theme }) }),

  exportBank: () => request<Record<string, unknown>[]>("/export"),
};
