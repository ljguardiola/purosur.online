import type { CatalogStore, CatalogTag } from "./catalog-store.js";
import { CatalogTagNameConflict } from "./catalog-store.js";

export interface CreateTagInput {
  name: string;
}

export type CreateTagOutcome = { kind: "name_taken" } | { kind: "created"; tag: CatalogTag };

export async function createTag(
  store: CatalogStore,
  input: CreateTagInput,
): Promise<CreateTagOutcome> {
  try {
    return await store.transaction(async (tx) => {
      if (await tx.tagNameTaken(input.name)) {
        return { kind: "name_taken" };
      }

      const created = await tx.insertTag(input.name);

      return {
        kind: "created",
        tag: { id: created.id, name: input.name, active: true, version: 1 },
      };
    });
  } catch (error) {
    if (!(error instanceof CatalogTagNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
