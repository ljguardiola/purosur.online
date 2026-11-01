import type { NewSupplierModalServices } from "./new-supplier-modal";
import { fetchPurchaseChoices, registerPurchase } from "./purchases-api";
import { createSupplier } from "./suppliers-api";

export type NewPurchaseScreenServices = {
  fetchPurchaseChoices: typeof fetchPurchaseChoices;
  registerPurchase: typeof registerPurchase;
} & NewSupplierModalServices;

export const defaultNewPurchaseScreenServices: NewPurchaseScreenServices = {
  fetchPurchaseChoices,
  registerPurchase,
  createSupplier,
};
