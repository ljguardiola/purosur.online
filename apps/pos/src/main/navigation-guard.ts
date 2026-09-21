function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function withoutFragment(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  return copy.href;
}

// Every file:, data:, about: and blob: URL shares the same opaque origin ("null"), so comparing
// origins can't tell the interface's own page apart from any of them.
export function isAllowedNavigation(entryUrl: string, targetUrl: string): boolean {
  const entry = parseUrl(entryUrl);
  const target = parseUrl(targetUrl);
  if (!entry || !target || target.protocol !== entry.protocol) {
    return false;
  }

  if (entry.protocol === "http:" || entry.protocol === "https:") {
    return target.origin === entry.origin;
  }

  if (entry.protocol === "file:") {
    return withoutFragment(target) === withoutFragment(entry);
  }

  return false;
}

export function denyWindowOpen(): { action: "deny" } {
  return { action: "deny" };
}

// Shared by `will-navigate` and `will-redirect`: a page that redirects itself away must be
// blocked exactly like one that navigates there directly, or the guard would only cover half of
// how a page can leave the application.
export function denyDisallowedNavigation(
  entryUrl: string,
  event: { preventDefault: () => void },
  targetUrl: string,
): void {
  if (!isAllowedNavigation(entryUrl, targetUrl)) {
    event.preventDefault();
  }
}
