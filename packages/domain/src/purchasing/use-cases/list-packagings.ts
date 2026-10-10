import type { PackagingListing, PurchasingListReader } from "./purchasing-list-reader.js";

export function listPackagings(reader: PurchasingListReader): Promise<PackagingListing[]> {
  return reader.packagings();
}
