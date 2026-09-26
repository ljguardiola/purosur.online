export const CATEGORY_NAME_MAX_LENGTH = 100;

/**
 * Counts Unicode code points rather than UTF-16 units, so a single emoji counts once; a composed
 * emoji such as a flag or a family still counts once per code point.
 */
export function categoryNameLength(name: string): number {
  return Array.from(name).length;
}

export function isCategoryNameTooLong(name: string): boolean {
  return categoryNameLength(name) > CATEGORY_NAME_MAX_LENGTH;
}
