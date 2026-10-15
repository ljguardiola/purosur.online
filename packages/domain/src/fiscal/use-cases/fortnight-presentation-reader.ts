import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import type { FortnightPresentationRow } from "../model/fortnight-report.js";
import type { Fortnight } from "../model/offline-authorization-code.js";

export interface BranchFortnightPresentation extends FortnightPresentationRow<FiscalDocumentType> {
  registerId: string;
  pointOfSaleNumber: number;
  fortnight: Fortnight;
  deadline: string;
}

export interface FortnightPresentationReader {
  branchPresentations(locationId: string, today: string): Promise<BranchFortnightPresentation[]>;
}
