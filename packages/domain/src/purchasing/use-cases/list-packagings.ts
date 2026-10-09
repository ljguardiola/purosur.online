import { PRODUCTS_PACKAGINGS_MAY_BE_DEFINED_FOR } from "../model/packaging.js";
import type {
  PackageableProduct,
  PackagingListing,
  PurchasingListReader,
} from "./purchasing-list-reader.js";

export interface PackagingList {
  packagings: PackagingListing[];
  products: PackageableProduct[];
}

export async function listPackagings(reader: PurchasingListReader): Promise<PackagingList> {
  const [packagings, products] = await Promise.all([
    reader.packagings(),
    reader.products(PRODUCTS_PACKAGINGS_MAY_BE_DEFINED_FOR),
  ]);
  return { packagings, products };
}
