import { fetchPurchases } from "./purchases-api";

export type PurchasesListScreenServices = {
  fetchPurchases: typeof fetchPurchases;
};

export const defaultPurchasesListScreenServices: PurchasesListScreenServices = {
  fetchPurchases,
};
