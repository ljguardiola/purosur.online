import type { Clock } from "../../shared/index.js";
import type { RealTimeAuthorizationAnswer } from "../model/real-time-authorization.js";
import type {
  RecordedRequestOutcome,
  TaxAuthorityVoucher,
  UnclearOutcomeDecision,
} from "../model/unclear-outcome-decision.js";
import type {
  AuthorizationRequestRecord,
  FiscalDocumentData,
  WsaaTokenSource,
} from "./fiscal-document-authorization-ports.js";
import type { TaxAuthorityLastAuthorizedLookup } from "./tax-authority-count-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export type UnclearRequestProgress =
  | { kind: "no_answer" }
  | { kind: "answered"; answer: RealTimeAuthorizationAnswer; answeredAt: Date };

export interface UnclearRequest extends FiscalDocumentData {
  fiscalDocumentId: string;
  progress: UnclearRequestProgress;
  decision: UnclearOutcomeDecision | null;
}

export type AbandonedRequestRecord = Omit<AuthorizationRequestRecord, "notAfter" | "receivedAt">;

export interface UnclearOutcomeWarningClearance {
  fiscalDocumentId: string;
  clearedAt: Date;
}

export interface UnclearOutcomeLane {
  unclearRequest(fiscalDocumentId: string): Promise<UnclearRequest | null>;
  recordAbandonment(fiscalDocumentId: string, abandonedAt: Date): Promise<void>;
  recordDecision(
    fiscalDocumentId: string,
    decision: UnclearOutcomeDecision,
    decidedAt: Date,
    clearedWarning: UnclearOutcomeWarningClearance,
  ): Promise<void>;
  registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean>;
  recordedRequest(
    registerId: string,
    fiscalDocumentId: string,
  ): Promise<RecordedRequestOutcome | null>;
  recordAbandonedRequest(request: AbandonedRequestRecord, abandonedAt: Date): Promise<void>;
}

export interface UnclearOutcomeLanes {
  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: UnclearOutcomeLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface UnclearOutcomeRequests {
  pointOfSaleOf(fiscalDocumentId: string): Promise<number | null>;
}

export type VoucherAnswer =
  | { kind: "found"; voucher: TaxAuthorityVoucher }
  | { kind: "none" }
  | { kind: "no_answer" };

export interface TaxAuthorityVoucherLookup {
  voucherAt(lookup: {
    token: WsaaToken;
    pointOfSale: number;
    number: number;
  }): Promise<VoucherAnswer>;
}

export interface DecideUnclearRealTimeOutcomePorts {
  requests: UnclearOutcomeRequests;
  lanes: UnclearOutcomeLanes;
  clock: Clock;
  tokens: WsaaTokenSource;
  vouchers: TaxAuthorityVoucherLookup;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
}

export interface AskAboutUnclearOutcomePorts {
  lanes: UnclearOutcomeLanes;
  clock: Clock;
}
