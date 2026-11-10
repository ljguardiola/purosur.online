import type { EditFreightModalServices } from "./edit-freight-modal";
import { fetchFreightReport } from "./freight-report-api";
import type { FreightReportContentServices } from "./freight-report-content-services";
import { editFreight, fetchFreights, fetchLinkablePurchases, recordFreight } from "./freights-api";
import type { NewFreightModalServices } from "./new-freight-modal";
import type { SupplierFilterServices } from "./purchasing-screen-parts";
import { fetchSupplierName } from "./suppliers-api";

export type FreightsListScreenServices = {
  fetchFreights: typeof fetchFreights;
} & FreightReportContentServices &
  SupplierFilterServices &
  NewFreightModalServices &
  EditFreightModalServices;

export const defaultFreightsListScreenServices: FreightsListScreenServices = {
  fetchFreights,
  fetchFreightReport,
  fetchSupplierName,
  fetchLinkablePurchases,
  recordFreight,
  editFreight,
};
