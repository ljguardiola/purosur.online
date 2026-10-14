import { discardExpiredLot, fetchExpiringLots } from "./stock-api";

export type ExpiringLotsScreenServices = {
  fetchExpiringLots: typeof fetchExpiringLots;
  discardExpiredLot: typeof discardExpiredLot;
};

export const defaultExpiringLotsScreenServices: ExpiringLotsScreenServices = {
  fetchExpiringLots,
  discardExpiredLot,
};
