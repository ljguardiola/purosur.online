import type { CatalogStore } from "./catalog-store.js";

export type ReactivateBrandOutcome =
  | { kind: "not_found" }
  | { kind: "already_active" }
  | { kind: "reactivated" };

export async function reactivateBrand(
  store: CatalogStore,
  brandId: string,
): Promise<ReactivateBrandOutcome> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockBrand(brandId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (locked.brand.active) {
      return { kind: "already_active" };
    }

    await tx.updateBrand(brandId, {
      name: locked.brand.name,
      active: true,
      version: locked.brand.version + 1,
    });

    return { kind: "reactivated" };
  });
}
