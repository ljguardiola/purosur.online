import type { CatalogBrand, CatalogStore } from "./catalog-store.js";
import { CatalogBrandNameConflict } from "./catalog-store.js";

export interface CreateBrandInput {
  name: string;
}

export type CreateBrandOutcome = { kind: "name_taken" } | { kind: "created"; brand: CatalogBrand };

export async function createBrand(
  store: CatalogStore,
  input: CreateBrandInput,
): Promise<CreateBrandOutcome> {
  try {
    return await store.transaction(async (tx) => {
      if (await tx.brandNameTaken(input.name)) {
        return { kind: "name_taken" };
      }

      const created = await tx.insertBrand(input.name);

      return {
        kind: "created",
        brand: { id: created.id, name: input.name, active: true, version: 1 },
      };
    });
  } catch (error) {
    if (!(error instanceof CatalogBrandNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
