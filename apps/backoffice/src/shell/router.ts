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

// No SSR here, so this is never read; useSyncExternalStore's signature still requires it.
function getServerSnapshot(): string {
  return "/";
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function onNavigate(listener: () => void): () => void {
  return subscribe(listener);
}

export type NavigateOptions = {
  replace?: boolean;
};

export function navigate(path: string, options: NavigateOptions = {}): void {
  if (options.replace) {
    window.history.replaceState(null, "", path);
  } else if (path !== window.location.pathname) {
    window.history.pushState(null, "", path);
  }
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}
