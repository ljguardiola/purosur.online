// Every directive resolves to either the app's own origin or nothing at all: no remote script,
// style, font or image origin, and no 'unsafe-inline'.
const DIRECTIVES: ReadonlyArray<readonly [name: string, value: string]> = [
  ["default-src", "'self'"],
  ["script-src", "'self'"],
  ["style-src", "'self'"],
  ["font-src", "'self'"],
  ["img-src", "'self'"],
  ["connect-src", "'self'"],
  ["object-src", "'none'"],
  ["base-uri", "'none'"],
  ["frame-ancestors", "'none'"],
];

export function buildContentSecurityPolicy(): string {
  return DIRECTIVES.map(([name, value]) => `${name} ${value}`).join("; ");
}
