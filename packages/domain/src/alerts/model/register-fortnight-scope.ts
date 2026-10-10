export const REGISTER_FORTNIGHT_SCOPE_SEPARATOR = ":";

export function registerFortnightScope(registerId: string, fortnightStart: string): string {
  return `${registerId}${REGISTER_FORTNIGHT_SCOPE_SEPARATOR}${fortnightStart}`;
}

export function registerFortnightScopeRegisterId(scope: string): string {
  return scope.split(REGISTER_FORTNIGHT_SCOPE_SEPARATOR)[0] ?? scope;
}
