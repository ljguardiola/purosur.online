// A sale a restored register replenishes was completed on the installation it replaces, which may
// have printed the original before its print state reached the cloud, so the register prints it
// again only as a duplicate.
export function replenishedSaleReceiptAttempt(
  completedAt: Date,
  heldAttempt: Date | null,
): Date | null {
  return heldAttempt === null ? completedAt : null;
}
