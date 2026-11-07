import { vi } from "vitest";
import type { FiscalStatusStripServices } from "../fiscal-status-strip-services";
import type { FortnightPresentation } from "../fortnight-presentations-api";

export function createFiscalStatusStripServices(): FiscalStatusStripServices {
  return {
    fetchFiscalTasks: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchUnbilledDeferredSales: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchCurrentOfflineAuthorizationCode: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchFortnightPresentations: vi.fn().mockReturnValue(new Promise(() => {})),
  };
}

export const owedPresentation: FortnightPresentation = {
  registerId: "register-1",
  pointOfSaleNumber: 4,
  fortnight: { start: "2026-10-16", end: "2026-10-31" },
  deadline: "2026-11-08",
  documentType: "factura_c",
  documentCount: 12,
  rejectedDocument: null,
  movement: "documents",
  refusal: null,
  state: "blocked",
  owed: true,
  revokedInstallations: [],
};

export const presentedPresentation: FortnightPresentation = {
  ...owedPresentation,
  pointOfSaleNumber: 5,
  state: "accepted",
  owed: false,
};
