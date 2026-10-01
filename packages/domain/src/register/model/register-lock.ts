export function isLockedToAnother(
  openSession: { openedBy: string } | undefined,
  personId: string | undefined,
): boolean {
  return openSession !== undefined && openSession.openedBy !== personId;
}
