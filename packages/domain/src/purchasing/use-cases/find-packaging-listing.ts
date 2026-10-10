import { type ListedPackaging, listedPackaging } from "./list-packagings.js";
import type { PurchasingListReader } from "./purchasing-list-reader.js";

export async function findPackagingListing(
  reader: PurchasingListReader,
  packagingId: string,
): Promise<ListedPackaging | undefined> {
  const listing = await reader.packaging(packagingId);
  return listing && listedPackaging(listing);
}
