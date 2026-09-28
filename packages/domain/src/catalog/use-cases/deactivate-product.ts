import type { CatalogStore } from "./catalog-store.js";

export type DeactivateProductOutcome = { kind: "not_found" } | { kind: "deactivated" };

// A product is never deleted, only deactivated; a database trigger on the cloud side backstops
// this by rejecting any `DELETE` outright.
export async function deactivateProduct(
  store: CatalogStore,
  productId: string,
): Promise<DeactivateProductOutcome> {
  return store.transaction(async (tx) => {
    // Locks and re-reads `active` under the lock, so a concurrent deactivation of the same
    // product waits instead of racing, and a second request never re-deactivates it.
    const locked = await tx.lockProductForUpdate(productId);
    if (locked.kind === "not_found" || !locked.product.active) {
      return { kind: "not_found" };
    }

    await tx.deactivateProduct(productId, locked.product.version + 1);
    await tx.deactivateProductBarcodes(productId);

    return { kind: "deactivated" };
  });
}
