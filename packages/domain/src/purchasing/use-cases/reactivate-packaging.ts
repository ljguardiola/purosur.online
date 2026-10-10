import type { PurchasingStore } from "./purchasing-store.js";

export type ReactivatePackagingOutcome =
  | { kind: "not_found" }
  | { kind: "already_active" }
  | { kind: "sale_unit_changed" }
  | { kind: "reactivated" };

export async function reactivatePackaging(
  store: PurchasingStore,
  input: { id: string; actorId: string },
): Promise<ReactivatePackagingOutcome> {
  return store.transaction(async (tx) => {
    const product = await tx.lockProductOfPackaging(input.id);
    if (product.kind === "not_found") {
      return { kind: "not_found" };
    }
    const locked = await tx.lockPackaging(input.id);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (locked.packaging.active) {
      return { kind: "already_active" };
    }
    if (locked.packaging.saleUnit !== product.product.saleUnit) {
      return { kind: "sale_unit_changed" };
    }

    await tx.updatePackaging(input.id, {
      name: locked.packaging.name,
      quantityPerPackage: locked.packaging.quantityPerPackage,
      saleUnit: locked.packaging.saleUnit,
      active: true,
      version: locked.packaging.version + 1,
      actorId: input.actorId,
    });

    return { kind: "reactivated" };
  });
}
