import type { CatalogStore } from "./catalog-store.js";

export type DeactivateTagOutcome =
  | { kind: "not_found" }
  | { kind: "already_inactive" }
  | { kind: "deactivated" };

export async function deactivateTag(
  store: CatalogStore,
  tagId: string,
): Promise<DeactivateTagOutcome> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockTag(tagId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!locked.tag.active) {
      return { kind: "already_inactive" };
    }

    await tx.updateTag(tagId, {
      name: locked.tag.name,
      active: false,
      version: locked.tag.version + 1,
    });

    return { kind: "deactivated" };
  });
}
