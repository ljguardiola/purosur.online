import type { CatalogStore } from "./catalog-store.js";
import { CatalogBarcodeConflict } from "./catalog-store.js";

export type ReactivateProductOutcome =
  | { kind: "not_found" }
  | { kind: "already_active" }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "reactivated" };

export async function reactivateProduct(
  store: CatalogStore,
  productId: string,
): Promise<ReactivateProductOutcome> {
  let barcodes: string[] = [];
  try {
    return await store.transaction(async (tx) => {
      const locked = await tx.lockProduct(productId);
      if (locked.kind === "not_found") {
        return { kind: "not_found" };
      }
      if (locked.product.active) {
        return { kind: "already_active" };
      }
      barcodes = locked.product.barcodes;

      const taken = await tx.activeBarcodesTaken(barcodes, productId);
      if (taken.length > 0) {
        return { kind: "barcode_taken", codes: taken };
      }

      await tx.reactivateProduct(productId, locked.product.version + 1);
      await tx.reactivateProductBarcodes(productId);

      return { kind: "reactivated" };
    });
  } catch (error) {
    if (!(error instanceof CatalogBarcodeConflict)) {
      throw error;
    }
    return { kind: "barcode_taken", codes: await store.activeBarcodesTaken(barcodes, productId) };
  }
}
