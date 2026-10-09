import type { PurchasingStore } from "./purchasing-store.js";

export type ReactivatePackagingOutcome =
  | { kind: "not_found" }
  | { kind: "already_active" }
  | { kind: "reactivated" };

export async function reactivatePackaging(
  store: PurchasingStore,
  input: { id: string; actorId: string },
): Promise<ReactivatePackagingOutcome> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockPackaging(input.id);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (locked.packaging.active) {
      return { kind: "already_active" };
    }

    await tx.updatePackaging(input.id, {
      name: locked.packaging.name,
      quantityPerPackage: locked.packaging.quantityPerPackage,
      active: true,
      version: locked.packaging.version + 1,
      actorId: input.actorId,
    });

    return { kind: "reactivated" };
  });
}
