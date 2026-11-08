import type { EditLotCostModalServices } from "./edit-lot-cost-modal";
import { fetchInitialInventoryLots, setLotReferenceCost } from "./stock-api";

export type ReviewInitialInventoryModalServices = EditLotCostModalServices & {
  fetchInitialInventoryLots: typeof fetchInitialInventoryLots;
};

export const defaultReviewInitialInventoryModalServices: ReviewInitialInventoryModalServices = {
  fetchInitialInventoryLots,
  setLotReferenceCost,
};
