import type { PurchasingStore, Supplier } from "./purchasing-store.js";
import { SupplierCuitConflict, SupplierNameConflict } from "./purchasing-store.js";

export interface CreateSupplierInput {
  name: string;
  cuit: string | null;
  contact: string | null;
  note: string | null;
  actorId: string;
}

export type CreateSupplierOutcome =
  | { kind: "name_taken" }
  | { kind: "cuit_taken" }
  | { kind: "created"; supplier: Supplier };

export async function createSupplier(
  store: PurchasingStore,
  input: CreateSupplierInput,
): Promise<CreateSupplierOutcome> {
  try {
    return await store.transaction(async (tx) => {
      if (await tx.supplierNameTaken(input.name)) {
        return { kind: "name_taken" };
      }
      if (input.cuit !== null && (await tx.supplierCuitTaken(input.cuit))) {
        return { kind: "cuit_taken" };
      }

      const created = await tx.insertSupplier(input);

      return {
        kind: "created",
        supplier: {
          id: created.id,
          name: input.name,
          cuit: input.cuit,
          contact: input.contact,
          note: input.note,
          active: true,
          version: 1,
        },
      };
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
