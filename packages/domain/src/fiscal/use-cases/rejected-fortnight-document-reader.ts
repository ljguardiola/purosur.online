import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import type { Fortnight } from "../model/offline-authorization-code.js";

export interface FortnightPresentationAwaitingRemedy {
  pointOfSaleNumber: number;
  registerId: string;
  fortnight: Fortnight;
  documentType: FiscalDocumentType;
  rejectedNumber: number;
}

export interface RejectedFortnightDocumentReader {
  presentationsAwaitingRemedy(): Promise<FortnightPresentationAwaitingRemedy[]>;
}
