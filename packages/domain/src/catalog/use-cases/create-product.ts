import type { SaleUnit } from "../model/product.js";
import type { CatalogNetContent, CatalogProduct, CatalogStore } from "./catalog-store.js";
import { CatalogBarcodeConflict } from "./catalog-store.js";
import { refuseUnassignableTags } from "./lock-product-tags.js";

export interface CreateProductInput {
  name: string;
  categoryId: string;
  brandId: string | null;
  saleUnit: SaleUnit;
  barcodes: string[];
  tagIds: string[];
  netContent: CatalogNetContent | null;
}

export type CreateProductOutcome =
  | { kind: "category_not_found" }
  | { kind: "category_not_leaf" }
  | { kind: "brand_not_found" }
  | { kind: "brand_inactive" }
  | { kind: "tag_not_found" }
  | { kind: "tag_inactive" }
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

      if (input.brandId !== null) {
        // Locks the brand, so a concurrent deactivation can't slip in between this check and the
        // product's insert.
        const brand = await tx.lockBrand(input.brandId);
        if (brand.kind === "not_found") {
          return { kind: "brand_not_found" };
        }
        if (!brand.brand.active) {
          return { kind: "brand_inactive" };
        }
      }

      const refusedTag = await refuseUnassignableTags(tx, input.tagIds);
      if (refusedTag) {
        return refusedTag;
      }

      const taken = await tx.activeBarcodesTaken(input.barcodes);
      if (taken.length > 0) {
        return { kind: "barcode_taken", codes: taken };
      }

      const created = await tx.insertProduct({
        name: input.name,
        categoryId: input.categoryId,
        brandId: input.brandId,
        saleUnit: input.saleUnit,
        netContent: input.netContent,
      });
      await tx.insertProductBarcodes(created.id, input.barcodes);
      await tx.insertProductTags(created.id, input.tagIds);

      return {
        kind: "created",
        product: {
          id: created.id,
          name: input.name,
          categoryId: input.categoryId,
          categoryName: locked.category.name,
          brandId: input.brandId,
          saleUnit: input.saleUnit,
          barcodes: input.barcodes,
          tagIds: input.tagIds,
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
