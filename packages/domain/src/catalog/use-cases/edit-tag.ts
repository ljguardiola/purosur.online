import type { CatalogStore, CatalogTag } from "./catalog-store.js";
import { CatalogTagNameConflict } from "./catalog-store.js";

export interface EditTagInput {
  id: string;
  name: string;
  version: number;
}

export type EditTagOutcome =
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "applied"; tag: CatalogTag };

export async function editTag(store: CatalogStore, input: EditTagInput): Promise<EditTagOutcome> {
  try {
    return await store.transaction(async (tx) => {
      // Locks this one row so a concurrent edit, deactivation or reactivation of the same tag
      // waits instead of racing.
      const locked = await tx.lockTag(input.id);
      if (locked.kind === "not_found" || locked.tag.version !== input.version) {
        return { kind: "stale_version" };
      }
      const { active, version } = locked.tag;

      if (locked.tag.name === input.name) {
        return { kind: "applied", tag: { id: input.id, name: input.name, active, version } };
      }

      if (await tx.tagNameTaken(input.name, input.id)) {
        return { kind: "name_taken" };
      }

      const nextVersion = version + 1;
      await tx.updateTag(input.id, { name: input.name, active, version: nextVersion });

      return {
        kind: "applied",
        tag: { id: input.id, name: input.name, active, version: nextVersion },
      };
    });
  } catch (error) {
    if (!(error instanceof CatalogTagNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
