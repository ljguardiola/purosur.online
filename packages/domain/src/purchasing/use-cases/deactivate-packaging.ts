import type { PurchasingStore } from "./purchasing-store.js";

export type DeactivatePackagingOutcome =
  | { kind: "not_found" }
  | { kind: "already_inactive" }
  | { kind: "deactivated" };

export async function deactivatePackaging(
  store: PurchasingStore,
  input: { id: string; actorId: string },
): Promise<DeactivatePackagingOutcome> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockPackaging(input.id);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!locked.packaging.active) {
      return { kind: "already_inactive" };
    }

    await tx.updatePackaging(input.id, {
      name: locked.packaging.name,
      quantityPerPackage: locked.packaging.quantityPerPackage,
      saleUnit: locked.packaging.saleUnit,
      active: false,
      version: locked.packaging.version + 1,
      actorId: input.actorId,
    });

    return { kind: "deactivated" };
  });
}
