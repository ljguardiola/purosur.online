import type { SaleUnit } from "../model/product.js";
import type { CatalogNetContent, CatalogProduct, CatalogStore } from "./catalog-store.js";
import { CatalogBarcodeConflict } from "./catalog-store.js";

export interface CreateProductInput {
  name: string;
  categoryId: string;
  saleUnit: SaleUnit;
  barcodes: string[];
  netContent: CatalogNetContent | null;
}

export type CreateProductOutcome =
  | { kind: "category_not_found" }
  | { kind: "category_not_leaf" }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "created"; product: CatalogProduct };

export async function createProduct(
  store: CatalogStore,
  input: CreateProductInput,
): Promise<CreateProductOutcome> {
  try {
    return await store.transaction(async (tx) => {
      const locked = await tx.lockLeafCategory(input.categoryId);
      if (locked.kind === "not_found") {
        return { kind: "category_not_found" };
      }
      if (locked.kind === "not_leaf") {
        return { kind: "category_not_leaf" };
      }

      const taken = await tx.activeBarcodesTaken(input.barcodes);
      if (taken.length > 0) {
        return { kind: "barcode_taken", codes: taken };
      }

      const created = await tx.insertProduct({
        name: input.name,
        categoryId: input.categoryId,
        saleUnit: input.saleUnit,
        netContent: input.netContent,
      });
      await tx.insertProductBarcodes(created.id, input.barcodes);

      return {
        kind: "created",
        product: {
          id: created.id,
          name: input.name,
          categoryId: input.categoryId,
          categoryName: locked.category.name,
          saleUnit: input.saleUnit,
          barcodes: input.barcodes,
          netContent: input.netContent,
          active: true,
          version: 1,
        },
      };
    });
  } catch (error) {
    if (!(error instanceof CatalogBarcodeConflict)) {
      throw error;
    }
    return { kind: "barcode_taken", codes: await store.activeBarcodesTaken(input.barcodes) };
  }
}
