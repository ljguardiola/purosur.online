import { fetchPurchaseChoices, registerPurchase } from "./purchases-api";

export type NewPurchaseScreenServices = {
  fetchPurchaseChoices: typeof fetchPurchaseChoices;
  registerPurchase: typeof registerPurchase;
};

export const defaultNewPurchaseScreenServices: NewPurchaseScreenServices = {
  fetchPurchaseChoices,
  registerPurchase,
};
