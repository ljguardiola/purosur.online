import type { PurchasingStore } from "./purchasing-store.js";

export type ReactivateSupplierOutcome =
  | { kind: "not_found" }
  | { kind: "already_active" }
  | { kind: "reactivated" };

export async function reactivateSupplier(
  store: PurchasingStore,
  input: { id: string; actorId: string },
): Promise<ReactivateSupplierOutcome> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockSupplier(input.id);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (locked.supplier.active) {
      return { kind: "already_active" };
    }

    await tx.updateSupplier(input.id, {
      name: locked.supplier.name,
      cuit: locked.supplier.cuit,
      contact: locked.supplier.contact,
      note: locked.supplier.note,
      active: true,
      version: locked.supplier.version + 1,
      actorId: input.actorId,
    });

    return { kind: "reactivated" };
  });
}
