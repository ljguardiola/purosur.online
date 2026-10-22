import type { Clock } from "../../shared/index.js";
import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type {
  DocumentFieldChange,
  RejectedDocumentRemedy,
} from "../model/rejected-document-remedy.js";
import type {
  FortnightReportKey,
  OfflineDocumentOfFortnight,
  RecordedDocumentTypeReport,
} from "./fortnight-report-ports.js";

export interface RejectedDocumentRemedyRecord {
  pointOfSaleNumber: number;
  fortnight: Fortnight;
  documentType: FiscalDocumentType;
  number: number;
  remedy: RejectedDocumentRemedy;
  rejectedAt: Date | null;
  recordedAt: Date;
}

export interface RejectedDocumentRemedyAudit {
  pointOfSaleNumber: number;
  fortnight: Fortnight;
  documentType: FiscalDocumentType;
  number: number;
  kind: RejectedDocumentRemedy["kind"];
  actorId: string;
  at: Date;
  changes: DocumentFieldChange[];
}

export interface RemedyRejectedDocumentStoreTransaction {
  /**
   * Takes the lock a run reporting the fortnight's documents holds while it presents them, so a
   * remedy is never recorded in the middle of a presentation.
   */
  holdFortnightPresentation(key: FortnightReportKey): Promise<void>;
  documentTypeReport(
    key: FortnightReportKey,
    documentType: FiscalDocumentType,
    locationId: string,
  ): Promise<RecordedDocumentTypeReport | null>;
  documentsOn(
    pointOfSaleNumber: number,
    fortnight: Fortnight,
    locationId: string,
  ): Promise<OfflineDocumentOfFortnight[]>;
  recordRemedy(record: RejectedDocumentRemedyRecord): Promise<void>;
  recordRemedyAudit(audit: RejectedDocumentRemedyAudit): Promise<void>;
}

export interface RemedyRejectedDocumentStore {
  transaction<TOutcome>(
    work: (tx: RemedyRejectedDocumentStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RemedyRejectedDocumentPorts {
  store: RemedyRejectedDocumentStore;
  clock: Clock;
}
