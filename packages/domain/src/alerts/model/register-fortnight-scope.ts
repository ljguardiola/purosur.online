const SEPARATOR = ":";

export function registerFortnightScope(registerId: string, fortnightStart: string): string {
  return `${registerId}${SEPARATOR}${fortnightStart}`;
}

export function registerFortnightScopeRegisterId(scope: string): string {
  return scope.split(SEPARATOR)[0] ?? scope;
}
