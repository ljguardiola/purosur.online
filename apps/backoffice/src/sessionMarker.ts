const STORAGE_KEY = "purosur-backoffice-was-signed-in";

// This marker is never the session itself — the session only ever lives in the server-set
// HttpOnly cookie. It is a plain local hint so the app can tell "never signed in" from "a
// session opened here and has since ended", to choose between the sign-in screen's plain and
// session-expired notices after the mount check finds no live session.

export function markSignedIn(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies); the marker is only a UX
    // hint, so a write failure is silently ignored.
  }
}

export function clearSignedInMarker(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See markSignedIn.
  }
}

export function wasSignedIn(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
