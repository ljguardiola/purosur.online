import type { CatalogStore } from "./catalog-store.js";

export type DeactivateProductOutcome =
  | { kind: "not_found" }
  | { kind: "already_inactive" }
  | { kind: "deactivated" };

export async function deactivateProduct(
  store: CatalogStore,
  productId: string,
): Promise<DeactivateProductOutcome> {
  return store.transaction(async (tx) => {
    // Locks and re-reads `active` under the lock, so a concurrent deactivation of the same
    // product waits instead of racing, and a second request never re-deactivates it.
    const locked = await tx.lockProduct(productId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!locked.product.active) {
      return { kind: "already_inactive" };
    }

    await tx.deactivateProduct(productId, locked.product.version + 1);
    await tx.deactivateProductBarcodes(productId);

    return { kind: "deactivated" };
  });
}
