import type { CatalogBrand, CatalogStore } from "./catalog-store.js";
import { CatalogBrandNameConflict } from "./catalog-store.js";

export interface EditBrandInput {
  id: string;
  name: string;
  version: number;
}

export type EditBrandOutcome =
  | { kind: "not_found" }
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "applied"; brand: CatalogBrand };

export async function editBrand(
  store: CatalogStore,
  input: EditBrandInput,
): Promise<EditBrandOutcome> {
  try {
    return await store.transaction(async (tx) => {
      // Locks this one row so a concurrent edit, deactivation or reactivation of the same brand
      // waits instead of racing.
      const locked = await tx.lockBrand(input.id);
      if (locked.kind === "not_found") {
        return { kind: "not_found" };
      }
      if (locked.brand.version !== input.version) {
        return { kind: "stale_version" };
      }
      const { active, version } = locked.brand;

      if (locked.brand.name === input.name) {
        return { kind: "applied", brand: { id: input.id, name: input.name, active, version } };
      }

      if (await tx.brandNameTaken(input.name, input.id)) {
        return { kind: "name_taken" };
      }

      const nextVersion = version + 1;
      await tx.updateBrand(input.id, { name: input.name, active, version: nextVersion });

      return {
        kind: "applied",
        brand: { id: input.id, name: input.name, active, version: nextVersion },
      };
    });
  } catch (error) {
    if (!(error instanceof CatalogBrandNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
