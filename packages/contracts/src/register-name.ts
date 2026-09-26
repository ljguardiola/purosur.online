export const REGISTER_NAME_MAX_LENGTH = 100;

/**
 * Counts Unicode code points rather than UTF-16 units, so a single emoji counts once; a composed
 * emoji such as a flag or a family still counts once per code point. Mirrors `categoryNameLength`.
 */
export function registerNameLength(name: string): number {
  return Array.from(name).length;
}
