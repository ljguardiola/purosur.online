import type { FiscalTaskDocumentType as FiscalDocumentType } from "../model/fiscal-task.js";
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
