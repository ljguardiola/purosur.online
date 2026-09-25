export const CATEGORY_NAME_MAX_LENGTH = 100;

/** Counts Unicode code points, so an emoji counts as one character rather than two. */
export function categoryNameLength(name: string): number {
  return Array.from(name).length;
}
