import type { CatalogStore } from "./catalog-store.js";

export type ReactivateTagOutcome =
  | { kind: "not_found" }
  | { kind: "already_active" }
  | { kind: "reactivated" };

export async function reactivateTag(
  store: CatalogStore,
  tagId: string,
): Promise<ReactivateTagOutcome> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockTag(tagId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (locked.tag.active) {
      return { kind: "already_active" };
    }

    await tx.updateTag(tagId, {
      name: locked.tag.name,
      active: true,
      version: locked.tag.version + 1,
    });

    return { kind: "reactivated" };
  });
}
