import { isQuantityPerPackage, mayDefinePackagingsFor } from "../model/packaging.js";
import type { Packaging, PurchasingStore } from "./purchasing-store.js";
import { PackagingNameConflict } from "./purchasing-store.js";

export interface CreatePackagingInput {
  productId: string;
  name: string;
  quantityPerPackage: number;
  actorId: string;
}

export type CreatePackagingOutcome =
  | { kind: "product_not_found" }
  | { kind: "invalid_quantity" }
  | { kind: "name_taken" }
  | { kind: "created"; packaging: Packaging };

export async function createPackaging(
  store: PurchasingStore,
  input: CreatePackagingInput,
): Promise<CreatePackagingOutcome> {
  try {
    return await store.transaction(async (tx) => {
      const locked = await tx.lockProduct(input.productId);
      if (locked.kind === "not_found" || !mayDefinePackagingsFor(locked.product)) {
        return { kind: "product_not_found" };
      }
      if (!isQuantityPerPackage(locked.product.saleUnit, input.quantityPerPackage)) {
        return { kind: "invalid_quantity" };
      }
      if (await tx.packagingNameTaken(locked.product.id, input.name)) {
        return { kind: "name_taken" };
      }

      const created = await tx.insertPackaging({
        ...input,
        productId: locked.product.id,
        saleUnit: locked.product.saleUnit,
      });

      return {
        kind: "created",
        packaging: {
          id: created.id,
          productId: locked.product.id,
          name: input.name,
          quantityPerPackage: input.quantityPerPackage,
          saleUnit: locked.product.saleUnit,
          active: true,
          version: 1,
        },
      };
    });
  } catch (error) {
    if (error instanceof PackagingNameConflict) {
      return { kind: "name_taken" };
    }
    throw error;
  }
}
