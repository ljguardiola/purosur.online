import type { PurchasingStore } from "./purchasing-store.js";

export type DeactivateSupplierOutcome =
  | { kind: "not_found" }
  | { kind: "already_inactive" }
  | { kind: "deactivated" };

export async function deactivateSupplier(
  store: PurchasingStore,
  input: { id: string; actorId: string },
): Promise<DeactivateSupplierOutcome> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockSupplier(input.id);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!locked.supplier.active) {
      return { kind: "already_inactive" };
    }

    await tx.updateSupplier(input.id, {
      name: locked.supplier.name,
      cuit: locked.supplier.cuit,
      contact: locked.supplier.contact,
      note: locked.supplier.note,
      active: false,
      version: locked.supplier.version + 1,
      actorId: input.actorId,
    });

    return { kind: "deactivated" };
  });
}
