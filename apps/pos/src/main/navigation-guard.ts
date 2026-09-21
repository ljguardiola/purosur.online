export function isSameOriginNavigation(appOrigin: string, targetUrl: string): boolean {
  try {
    return new URL(targetUrl).origin === appOrigin;
  } catch {
    return false;
  }
}

export function denyWindowOpen(): { action: "deny" } {
  return { action: "deny" };
}
