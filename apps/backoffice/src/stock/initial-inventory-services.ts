import type { EditLotCostModalServices } from "./edit-lot-cost-modal";
import { fetchInitialInventoryLots, setLotReferenceCost } from "./stock-api";

export type InitialInventoryScreenServices = EditLotCostModalServices & {
  fetchInitialInventoryLots: typeof fetchInitialInventoryLots;
};

export const defaultInitialInventoryScreenServices: InitialInventoryScreenServices = {
  fetchInitialInventoryLots,
  setLotReferenceCost,
};
