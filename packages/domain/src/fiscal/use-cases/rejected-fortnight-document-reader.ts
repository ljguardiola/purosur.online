import type { OfflineSeriesDocumentType } from "../model/fiscal-voucher-type.js";
import type { Fortnight } from "../model/offline-authorization-code.js";

export interface FortnightPresentationAwaitingRemedy {
  pointOfSaleNumber: number;
  registerId: string;
  fortnight: Fortnight;
  documentType: OfflineSeriesDocumentType;
  rejectedNumber: number;
}

export interface RejectedFortnightDocumentReader {
  presentationsAwaitingRemedy(): Promise<FortnightPresentationAwaitingRemedy[]>;
}
