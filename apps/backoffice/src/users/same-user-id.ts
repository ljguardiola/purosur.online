// The cloud accepts a user id in any letter case, so an id read from the URL may differ in case
// from the same user's id as the cloud lists it.
export function isSameUserId(one: string, other: string): boolean {
  return one.toLowerCase() === other.toLowerCase();
}
