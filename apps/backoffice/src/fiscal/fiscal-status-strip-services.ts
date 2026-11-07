import { fetchCurrentOfflineAuthorizationCode } from "./current-offline-authorization-code-api";
import { fetchFiscalTasks } from "./fiscal-tasks-api";
import { fetchFortnightPresentations } from "./fortnight-presentations-api";
import { fetchUnbilledDeferredSales } from "./unbilled-deferred-sales-api";

export type FiscalStatusStripServices = {
  fetchFiscalTasks: typeof fetchFiscalTasks;
  fetchUnbilledDeferredSales: typeof fetchUnbilledDeferredSales;
  fetchCurrentOfflineAuthorizationCode: typeof fetchCurrentOfflineAuthorizationCode;
  fetchFortnightPresentations: typeof fetchFortnightPresentations;
};

export const defaultFiscalStatusStripServices: FiscalStatusStripServices = {
  fetchFiscalTasks,
  fetchUnbilledDeferredSales,
  fetchCurrentOfflineAuthorizationCode,
  fetchFortnightPresentations,
};
