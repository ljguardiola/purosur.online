/**
 * Railway and GitHub deliver a multi-line variable either with real newlines or, collapsed to one
 * line, as the literal two-character sequence `\n`; both are accepted so the PEM parses either way.
 */
export function normalizePemNewlines(pem: string): string {
  return pem.includes("\\n") ? pem.replaceAll("\\n", "\n") : pem;
}
