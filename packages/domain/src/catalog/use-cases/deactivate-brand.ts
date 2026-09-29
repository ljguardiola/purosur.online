import type { CatalogStore } from "./catalog-store.js";

export type DeactivateBrandOutcome =
  | { kind: "not_found" }
  | { kind: "already_inactive" }
  | { kind: "deactivated" };

// Products that already carry the brand keep it: only new assignments stop being offered.
export async function deactivateBrand(
  store: CatalogStore,
  brandId: string,
): Promise<DeactivateBrandOutcome> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockBrand(brandId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!locked.brand.active) {
      return { kind: "already_inactive" };
    }

    await tx.updateBrand(brandId, {
      name: locked.brand.name,
      active: false,
      version: locked.brand.version + 1,
    });

    return { kind: "deactivated" };
  });
}
