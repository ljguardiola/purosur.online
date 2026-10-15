import type { FortnightReportState } from "../model/fortnight-report.js";
import type { Fortnight } from "../model/offline-authorization-code.js";

export interface BranchFortnightPresentation {
  registerId: string;
  pointOfSaleNumber: number;
  fortnight: Fortnight;
  deadline: string;
  state: FortnightReportState | null;
}

export interface FortnightPresentationReader {
  branchPresentations(locationId: string, today: string): Promise<BranchFortnightPresentation[]>;
}
