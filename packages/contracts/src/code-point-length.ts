/**
 * Counts Unicode code points rather than UTF-16 units, so a single emoji counts once; a composed
 * emoji such as a flag or a family still counts once per code point.
 */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}
