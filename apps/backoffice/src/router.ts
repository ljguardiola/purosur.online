import { useSyncExternalStore } from "react";

// Fired after every navigate() push, since a pushState() call never triggers "popstate" on its
// own — only the browser's back/forward buttons do.
const NAVIGATE_EVENT = "purosur:navigate";

function subscribe(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(NAVIGATE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(NAVIGATE_EVENT, callback);
  };
}

function getSnapshot(): string {
  return window.location.pathname;
}

// The app has no server-rendered markup to hydrate, so useSyncExternalStore's server snapshot is
// never read; it is required by the hook's signature regardless.
function getServerSnapshot(): string {
  return "/";
}

/** The current URL path, re-rendering its caller on every navigate() call and browser back/forward. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Pushes a new history entry for `path` and notifies every mounted useRoute(). */
export function navigate(path: string): void {
  if (path === window.location.pathname) {
    return;
  }
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}
