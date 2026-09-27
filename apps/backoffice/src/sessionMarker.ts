const STORAGE_KEY = "purosur-backoffice-was-signed-in";

// Never the session itself — that only ever lives in the server-set HttpOnly cookie. This is a
// local hint distinguishing "never signed in" from "a session opened here and has since ended".

export function markSignedIn(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies); a write failure is
    // silently ignored since this is only a UX hint.
  }
}

export function clearSignedInMarker(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function wasSignedIn(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
