import { useSyncExternalStore } from "react";

// pushState() and replaceState() never fire "popstate"; only the browser's back/forward buttons do.
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

/** Calls `listener` on every navigate() call, even to the current path, and on browser back/forward. */
export function onNavigate(listener: () => void): () => void {
  return subscribe(listener);
}

export type NavigateOptions = {
  replace?: boolean;
};

/** Moves to `path` in a new history entry, or in the current one with `replace`, and notifies every useRoute() and onNavigate() listener. */
export function navigate(path: string, options: NavigateOptions = {}): void {
  if (options.replace) {
    window.history.replaceState(null, "", path);
  } else if (path !== window.location.pathname) {
    window.history.pushState(null, "", path);
  }
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}
