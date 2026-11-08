import type { EditLotCostModalServices } from "./edit-lot-cost-modal";
import type { fetchInitialInventoryLots } from "./stock-api";

export type InitialInventoryScreenServices = EditLotCostModalServices & {
  fetchInitialInventoryLots: typeof fetchInitialInventoryLots;
};
