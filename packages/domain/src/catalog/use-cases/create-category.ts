import type { CatalogCategory, CatalogStore } from "./catalog-store.js";
import { CatalogCategoryNameConflict } from "./catalog-store.js";

export interface CreateCategoryInput {
  name: string;
  parentId: string | null;
}

export type CreateCategoryOutcome =
  | { kind: "name_taken" }
  | { kind: "parent_not_found" }
  | { kind: "parent_has_products" }
  | { kind: "created"; category: CatalogCategory };

export async function createCategory(
  store: CatalogStore,
  input: CreateCategoryInput,
): Promise<CreateCategoryOutcome> {
  try {
    return await store.transaction(async (tx) => {
      if (input.parentId !== null) {
        // Locks the parent, so this and a concurrent category create or move targeting it can
        // never both slip past the "has products" check below.
        const parent = await tx.lockParentForNewChild(input.parentId);
        if (parent.kind === "not_found") {
          return { kind: "parent_not_found" };
        }
        if (parent.kind === "has_products") {
          return { kind: "parent_has_products" };
        }
      }

      if (await tx.siblingNameTaken(input.parentId, input.name)) {
        return { kind: "name_taken" };
      }

      const created = await tx.insertCategory(input.name, input.parentId);

      return {
        kind: "created",
        category: { id: created.id, name: input.name, parentId: input.parentId, version: 1 },
      };
    });
  } catch (error) {
    if (!(error instanceof CatalogCategoryNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
