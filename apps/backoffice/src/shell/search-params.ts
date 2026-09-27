export function parseSearch(searchStr: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(searchStr));
}

export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const searchStr = params.toString();
  return searchStr ? `?${searchStr}` : "";
}
