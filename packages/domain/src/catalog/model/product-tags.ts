export function repeatsATag(tagIds: readonly string[]): boolean {
  return new Set(tagIds).size !== tagIds.length;
}
