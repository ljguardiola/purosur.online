import type { PackagingListing, PurchasingListReader } from "./purchasing-list-reader.js";

export function findPackagingListing(
  reader: PurchasingListReader,
  packagingId: string,
): Promise<PackagingListing | undefined> {
  return reader.packaging(packagingId);
}
