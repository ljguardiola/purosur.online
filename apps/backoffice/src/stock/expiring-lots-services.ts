import { fetchExpiringLotsReport } from "./expiring-lots-report-api";
import { discardExpiredLot, fetchExpiringLots } from "./stock-api";

export type ExpiringLotsScreenServices = {
  fetchExpiringLots: typeof fetchExpiringLots;
  fetchExpiringLotsReport: typeof fetchExpiringLotsReport;
  discardExpiredLot: typeof discardExpiredLot;
};

export const defaultExpiringLotsScreenServices: ExpiringLotsScreenServices = {
  fetchExpiringLots,
  fetchExpiringLotsReport,
  discardExpiredLot,
};
