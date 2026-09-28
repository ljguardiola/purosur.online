import type { CatalogCategory, CatalogStore, CatalogStoreTransaction } from "./catalog-store.js";
import { CatalogCategoryNameConflict } from "./catalog-store.js";

export interface EditCategoryInput {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
}

export type EditCategoryOutcome =
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "parent_not_found" }
  | { kind: "parent_has_products" }
  | { kind: "move_not_allowed" }
  | { kind: "applied"; category: CatalogCategory };

// A category tree has no cycles, so walking parentId up from newParentId always terminates.
async function wouldCreateCycle(
  tx: CatalogStoreTransaction,
  newParentId: string,
  movingCategoryId: string,
): Promise<boolean> {
  let currentId: string | null = newParentId;
  while (currentId !== null) {
    if (currentId === movingCategoryId) {
      return true;
    }
    currentId = await tx.parentIdOf(currentId);
  }
  return false;
}

export async function editCategory(
  store: CatalogStore,
  input: EditCategoryInput,
): Promise<EditCategoryOutcome> {
  try {
    return await store.transaction(async (tx) => {
      if (input.parentId !== null) {
        await tx.lockCategoryTreeForMove();
      }

      // Locks this one row so a concurrent edit against the same category waits instead of racing.
      const locked = await tx.lockCategory(input.id);
      if (locked.kind === "not_found" || locked.category.version !== input.version) {
        return { kind: "stale_version" };
      }

      const parentChanged = locked.category.parentId !== input.parentId;
      if (!parentChanged && locked.category.name === input.name) {
        return {
          kind: "applied",
          category: {
            id: input.id,
            name: input.name,
            parentId: input.parentId,
            version: locked.category.version,
          },
        };
      }

      if (parentChanged && input.parentId !== null) {
        const parent = await tx.lockParentForNewChild(input.parentId);
        if (parent.kind === "not_found") {
          return { kind: "parent_not_found" };
        }
        if (parent.kind === "has_products") {
          return { kind: "parent_has_products" };
        }
        if (await wouldCreateCycle(tx, input.parentId, input.id)) {
          return { kind: "move_not_allowed" };
        }
      }

      if (await tx.siblingNameTaken(input.parentId, input.name, input.id)) {
        return { kind: "name_taken" };
      }

      const nextVersion = locked.category.version + 1;
      await tx.updateCategory(input.id, {
        name: input.name,
        parentId: input.parentId,
        version: nextVersion,
      });

      return {
        kind: "applied",
        category: {
          id: input.id,
          name: input.name,
          parentId: input.parentId,
          version: nextVersion,
        },
      };
    });
  } catch (error) {
    if (!(error instanceof CatalogCategoryNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
