import type { Clock } from "../../shared/index.js";
import type {
  NumberingConflictDiagnosis,
  NumberingFreeze,
  NumberingReconciliationDocument,
} from "../model/numbering-conflict.js";
import type { OrphanRegularization } from "../model/orphan-authorization.js";
import type { RealTimeAuthorizationAnswer } from "../model/real-time-authorization.js";
import type { WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type { OrphanStandingReader } from "./orphan-authorization-ports.js";
import type { IdGenerator } from "./sale-authorization-ports.js";
import type { TaxAuthorityLastAuthorizedLookup } from "./tax-authority-count-ports.js";
import type { TaxAuthorityVoucherLookup } from "./unclear-outcome-ports.js";

export type { NumberingFreeze };

export interface NumberingConflictRequest {
  pointOfSale: number;
  number: number;
  issuedOn: string;
  answer: RealTimeAuthorizationAnswer | null;
  unclearCodes: readonly number[];
  diagnosis: NumberingConflictDiagnosis | null;
}

export interface NumberingDiagnosisRecord {
  fiscalDocumentId: string;
  diagnosis: NumberingConflictDiagnosis;
  diagnosedAt: Date;
  freeze: NumberingFreeze | null;
}

export interface NumberingConflictLane extends OrphanStandingReader {
  numberingConflictRequest(fiscalDocumentId: string): Promise<NumberingConflictRequest | null>;
  /**
   * Records the diagnosis and, given a freeze, takes it and requests the point of sale's
   * reconciliation, all or nothing.
   */
  recordNumberingDiagnosis(record: NumberingDiagnosisRecord): Promise<void>;
  numberingFreeze(): Promise<NumberingFreeze | null>;
  taxAuthorityCount(): Promise<number>;
  documentsInNumberingRange(range: {
    after: number;
    through: number;
  }): Promise<NumberingReconciliationDocument[]>;
  /**
   * Records each regularization (a credit note request, or an alert with its task for a person),
   * sets the count so the series continues right after the last authorized number (never lowering
   * a count already held) and lifts the freeze, all or nothing.
   */
  settleNumberingReconciliation(settlement: {
    regularizations: readonly OrphanRegularization[];
    lastAuthorized: number;
  }): Promise<void>;
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
  clock: Clock;
  ids: IdGenerator;
  tokens: WsaaTokenSource;
  vouchers: TaxAuthorityVoucherLookup;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
}
