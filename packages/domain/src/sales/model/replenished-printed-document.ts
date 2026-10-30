// A document a restored register replenishes was issued on the installation it replaces, which may
// have printed the original before its print state reached the cloud, so the register prints it
// again only as a duplicate.
export function replenishedPrintAttempt(
  printableSince: Date,
  heldAttempt: Date | null,
): Date | null {
  return heldAttempt === null ? printableSince : null;
}
