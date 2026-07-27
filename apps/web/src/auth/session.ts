// Remembers that a session existed, so a reload without a network doesn't
// look like a logout.
//
// The session cookie itself lives in the browser and long outlives any offline
// stretch; what fails offline is *checking* it. Treating that check's failure
// as "not logged in" drops the user onto a login form they cannot submit —
// with their cached bank and their queued writes sitting right there, out of
// reach. So we keep the last known email and, when the check fails for network
// reasons rather than a rejection, carry on with it.

const KEY = "zitie-session-email";

export function rememberSession(email: string): void {
  try {
    window.localStorage.setItem(KEY, email);
  } catch {
    // no storage — the user just re-authenticates after an offline reload
  }
}

export function rememberedSession(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetSession(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to forget
  }
}
