import { hasProductSaleUnitChanged } from "../model/packaging.js";
import type { PackagingListing, PurchasingListReader } from "./purchasing-list-reader.js";

export interface ListedPackaging extends PackagingListing {
  saleUnitChanged: boolean;
}

export function listedPackaging(listing: PackagingListing): ListedPackaging {
  return {
    ...listing,
    saleUnitChanged: hasProductSaleUnitChanged(listing.saleUnit, listing.productSaleUnit),
  };
}

export async function listPackagings(reader: PurchasingListReader): Promise<ListedPackaging[]> {
  return (await reader.packagings()).map(listedPackaging);
}
