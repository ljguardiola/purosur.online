import type { NewPackagingModalServices } from "./new-packaging-modal";
import type { NewSupplierModalServices } from "./new-supplier-modal";
import { createPackaging } from "./packagings-api";
import { fetchPurchaseChoices, registerPurchase } from "./purchases-api";
import { createSupplier } from "./suppliers-api";

export type NewPurchaseScreenServices = {
  fetchPurchaseChoices: typeof fetchPurchaseChoices;
  registerPurchase: typeof registerPurchase;
} & NewSupplierModalServices &
  NewPackagingModalServices;

export const defaultNewPurchaseScreenServices: NewPurchaseScreenServices = {
  fetchPurchaseChoices,
  registerPurchase,
  createSupplier,
  createPackaging,
};
