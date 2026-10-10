import { fetchPackagings } from "./packagings-api";
import { registerPurchase } from "./purchases-api";
import { fetchSuppliers } from "./suppliers-api";

export type NewPurchaseScreenServices = {
  fetchSuppliers: typeof fetchSuppliers;
  fetchPackagings: typeof fetchPackagings;
  registerPurchase: typeof registerPurchase;
};

export const defaultNewPurchaseScreenServices: NewPurchaseScreenServices = {
  fetchSuppliers,
  fetchPackagings,
  registerPurchase,
};
