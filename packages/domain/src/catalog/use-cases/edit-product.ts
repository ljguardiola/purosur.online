import type { SaleUnit } from "../model/product.js";
import type { CatalogNetContent, CatalogProduct, CatalogStore } from "./catalog-store.js";
import { CatalogBarcodeConflict } from "./catalog-store.js";

export interface EditProductInput {
  id: string;
  name: string;
  categoryId: string;
  saleUnit: SaleUnit;
  barcodes: string[];
  netContent: CatalogNetContent | null;
  version: number;
}

export type EditProductOutcome =
  | { kind: "stale_version" }
  | { kind: "category_not_found" }
  | { kind: "category_not_leaf" }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "applied"; product: CatalogProduct };

export async function editProduct(
  store: CatalogStore,
  input: EditProductInput,
): Promise<EditProductOutcome> {
  try {
    return await store.transaction(async (tx) => {
      // Locks this one row so a concurrent edit against the same product waits instead of racing.
      const locked = await tx.lockProduct(input.id);
      if (locked.kind === "not_found" || locked.product.version !== input.version) {
        return { kind: "stale_version" };
      }

      const lockedCategory = await tx.lockLeafCategory(input.categoryId);
      if (lockedCategory.kind === "not_found") {
        return { kind: "category_not_found" };
      }
      if (lockedCategory.kind === "not_leaf") {
        return { kind: "category_not_leaf" };
      }

      // Skipped for an inactive product: its barcodes are written inactive below, so none can
      // conflict under the active-only uniqueness rule.
      if (locked.product.active) {
        const taken = await tx.activeBarcodesTaken(input.barcodes, input.id);
        if (taken.length > 0) {
          return { kind: "barcode_taken", codes: taken };
        }
      }

      const nextVersion = locked.product.version + 1;
      await tx.updateProduct(input.id, {
        name: input.name,
        categoryId: input.categoryId,
        saleUnit: input.saleUnit,
        netContent: input.netContent,
        version: nextVersion,
      });
      await tx.replaceProductBarcodes(input.id, input.barcodes);

      return {
        kind: "applied",
        product: {
          id: input.id,
          name: input.name,
          categoryId: input.categoryId,
          categoryName: lockedCategory.category.name,
          saleUnit: input.saleUnit,
          barcodes: input.barcodes,
          netContent: input.netContent,
          active: locked.product.active,
          version: nextVersion,
        },
      };
    });
  } catch (error) {
    if (!(error instanceof CatalogBarcodeConflict)) {
      throw error;
    }
    return {
      kind: "barcode_taken",
      codes: await store.activeBarcodesTaken(input.barcodes, input.id),
    };
  }
}
