import type { EditFreightModalServices } from "./edit-freight-modal";
import { editFreight, fetchFreights, fetchLinkablePurchases, recordFreight } from "./freights-api";
import type { NewFreightModalServices } from "./new-freight-modal";

export type FreightsListScreenServices = {
  fetchFreights: typeof fetchFreights;
} & NewFreightModalServices &
  EditFreightModalServices;

export const defaultFreightsListScreenServices: FreightsListScreenServices = {
  fetchFreights,
  fetchLinkablePurchases,
  recordFreight,
  editFreight,
};
