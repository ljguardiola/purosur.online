import { isQuantityPerPackage } from "../model/packaging.js";
import type { Packaging, PurchasingStore } from "./purchasing-store.js";
import { PackagingNameConflict } from "./purchasing-store.js";

export interface EditPackagingInput {
  id: string;
  name: string;
  quantityPerPackage: number;
  version: number;
  actorId: string;
}

export type EditPackagingOutcome =
  | { kind: "not_found" }
  | { kind: "stale_version" }
  | { kind: "invalid_quantity" }
  | { kind: "name_taken" }
  | { kind: "applied"; packaging: Packaging };

export async function editPackaging(
  store: PurchasingStore,
  input: EditPackagingInput,
): Promise<EditPackagingOutcome> {
  try {
    return await store.transaction(async (tx) => {
      const product = await tx.lockProductOfPackaging(input.id);
      if (product.kind === "not_found") {
        return { kind: "not_found" };
      }
      const locked = await tx.lockPackaging(input.id);
      if (locked.kind === "not_found") {
        return { kind: "not_found" };
      }
      const current = locked.packaging;
      if (current.version !== input.version) {
        return { kind: "stale_version" };
      }
      if (!isQuantityPerPackage(product.product.saleUnit, input.quantityPerPackage)) {
        return { kind: "invalid_quantity" };
      }

      if (current.name === input.name && current.quantityPerPackage === input.quantityPerPackage) {
        return { kind: "applied", packaging: current };
      }

      if (
        current.name !== input.name &&
        (await tx.packagingNameTaken(current.productId, input.name, current.id))
      ) {
        return { kind: "name_taken" };
      }

      const next: Packaging = {
        ...current,
        name: input.name,
        quantityPerPackage: input.quantityPerPackage,
        version: current.version + 1,
      };
      await tx.updatePackaging(current.id, {
        name: next.name,
        quantityPerPackage: next.quantityPerPackage,
        active: next.active,
        version: next.version,
        actorId: input.actorId,
      });

      return { kind: "applied", packaging: next };
    });
  } catch (error) {
    if (error instanceof PackagingNameConflict) {
      return { kind: "name_taken" };
    }
    throw error;
  }
}
