import type { CatalogStoreTransaction } from "./catalog-store.js";

export type ProductTagsRefusal =
  | { kind: "tag_not_found" }
  | { kind: "tag_inactive"; tagId: string };

// Locks the tags in id order, so two products taking overlapping sets of tags never wait on each
// other in opposite orders.
export async function refuseUnassignableTags(
  tx: CatalogStoreTransaction,
  tagIds: readonly string[],
  alreadyCarried?: readonly string[],
): Promise<ProductTagsRefusal | null> {
  for (const tagId of [...tagIds].sort()) {
    const tag = await tx.lockTag(tagId);
    if (tag.kind === "not_found") {
      return { kind: "tag_not_found" };
    }
    if (!tag.tag.active && !alreadyCarried?.includes(tagId)) {
      return { kind: "tag_inactive", tagId };
    }
  }
  return null;
}
