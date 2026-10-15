import type { Clock } from "../../shared/index.js";
import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import type {
  NumberingConflictDiagnosis,
  NumberingReconciliationDocument,
} from "../model/numbering-conflict.js";
import type { RealTimeAuthorizationAnswer } from "../model/real-time-authorization.js";
import type { WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type { TaxAuthorityLastAuthorizedLookup } from "./tax-authority-count-ports.js";
import type { TaxAuthorityVoucherLookup } from "./unclear-outcome-ports.js";

export interface NumberingConflictRequest {
  pointOfSale: number;
  number: number;
  issuedOn: string;
  answer: RealTimeAuthorizationAnswer | null;
  unclearCodes: readonly number[];
  diagnosis: NumberingConflictDiagnosis | null;
}

export interface NumberingFreeze {
  countBeforeFreeze: number;
  frozenAt: Date;
}

export interface ExternalBillingOpening {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  number: number;
}

export interface NumberingConflictLane {
  numberingConflictRequest(fiscalDocumentId: string): Promise<NumberingConflictRequest | null>;
  recordNumberingDiagnosis(
    fiscalDocumentId: string,
    diagnosis: NumberingConflictDiagnosis,
    diagnosedAt: Date,
  ): Promise<void>;
  numberingFreeze(): Promise<NumberingFreeze | null>;
  taxAuthorityCount(): Promise<number>;
  freezeNumbering(freeze: NumberingFreeze): Promise<void>;
  requestNumberingReconciliation(): Promise<void>;
  documentsInNumberingRange(range: {
    after: number;
    through: number;
  }): Promise<NumberingReconciliationDocument[]>;
  openExternalBillingAlert(opening: ExternalBillingOpening): Promise<void>;
  /** Sets the count so the series continues right after the number; never lowers a count already held. */
  continueNumberingAfter(lastAuthorized: number): Promise<void>;
  liftNumberingFreeze(): Promise<void>;
}

export interface NumberingConflictLanes {
  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: NumberingConflictLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface NumberingConflictRequests {
  pointOfSaleOf(fiscalDocumentId: string): Promise<number | null>;
}

export interface DiagnoseNumberingConflictPorts {
  requests: NumberingConflictRequests;
  lanes: NumberingConflictLanes;
  clock: Clock;
  tokens: WsaaTokenSource;
  vouchers: TaxAuthorityVoucherLookup;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
}

export interface ReconcileNumberingConflictPorts {
  lanes: NumberingConflictLanes;
  tokens: WsaaTokenSource;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
}
