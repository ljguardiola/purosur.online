import type { PurchasingStore, Supplier } from "./purchasing-store.js";
import { SupplierCuitConflict, SupplierNameConflict } from "./purchasing-store.js";

export interface EditSupplierInput {
  id: string;
  name: string;
  cuit: string | null;
  contact: string | null;
  note: string | null;
  version: number;
  actorId: string;
}

export type EditSupplierOutcome =
  | { kind: "not_found" }
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "cuit_taken" }
  | { kind: "applied"; supplier: Supplier };

export async function editSupplier(
  store: PurchasingStore,
  input: EditSupplierInput,
): Promise<EditSupplierOutcome> {
  try {
    return await store.transaction(async (tx) => {
      const locked = await tx.lockSupplier(input.id);
      if (locked.kind === "not_found") {
        return { kind: "not_found" };
      }
      const current = locked.supplier;
      if (current.version !== input.version) {
        return { kind: "stale_version" };
      }

      const next: Supplier = {
        id: current.id,
        name: input.name,
        cuit: input.cuit,
        contact: input.contact,
        note: input.note,
        active: current.active,
        version: current.version,
      };

      if (
        current.name === next.name &&
        current.cuit === next.cuit &&
        current.contact === next.contact &&
        current.note === next.note
      ) {
        return { kind: "applied", supplier: next };
      }

      if (await tx.supplierNameTaken(next.name, current.id)) {
        return { kind: "name_taken" };
      }
      if (next.cuit !== null && (await tx.supplierCuitTaken(next.cuit, current.id))) {
        return { kind: "cuit_taken" };
      }

      next.version = current.version + 1;
      await tx.updateSupplier(current.id, {
        name: next.name,
        cuit: next.cuit,
        contact: next.contact,
        note: next.note,
        active: next.active,
        version: next.version,
        actorId: input.actorId,
      });

      return { kind: "applied", supplier: next };
    });
  } catch (error) {
    if (error instanceof SupplierNameConflict) {
      return { kind: "name_taken" };
    }
    if (error instanceof SupplierCuitConflict) {
      return { kind: "cuit_taken" };
    }
    throw error;
  }
}
