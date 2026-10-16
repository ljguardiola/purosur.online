import type { Clock } from "../../shared/index.js";
import type { TaxAuthorityRejection } from "../model/fiscal-rejection-standing.js";
import type { FiscalTask } from "../model/fiscal-task.js";
import type {
  ExternalInvoicingRegularization,
  VoucherReference,
} from "../model/orphan-authorization.js";
import type { SolicitationAnswer, WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type { TaxAuthorityLastAuthorizedLookup } from "./tax-authority-count-ports.js";
import type { TaxAuthorityVoucherLookup } from "./unclear-outcome-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export type CreditNoteStanding =
  | { kind: "not_requested" }
  | {
      kind: "requested";
      number: number;
      issuedOn: string;
      requestedAt: Date;
      unclearAnsweredAt: Date | null;
    }
  | { kind: "authorized" }
  | { kind: "rejected" };

export interface OrphanCreditNote {
  creditNoteId: string;
  pointOfSale: number;
  associatedVoucher: VoucherReference;
  total: number;
  receiverTaxStatusCode: number;
  standing: CreditNoteStanding;
}

export interface CreditNoteRequestRecord {
  creditNoteId: string;
  number: number;
  issuedOn: string;
  requestedAt: Date;
}

export interface CreditNoteAuthorizationRecord {
  creditNoteId: string;
  authorizationCode: string;
  authorizationCodeDueOn: string;
  authorizedAt: Date;
}

export interface CreditNoteRejectionRecord {
  creditNoteId: string;
  rejections: readonly TaxAuthorityRejection[];
  rejectedAt: Date;
  task: FiscalTask;
}

export interface OrphanCreditNoteLane {
  orphanCreditNote(creditNoteId: string): Promise<OrphanCreditNote | null>;
  recordCreditNoteRequest(request: CreditNoteRequestRecord): Promise<void>;
  recordCreditNoteAuthorized(authorization: CreditNoteAuthorizationRecord): Promise<void>;
  /**
   * Records the rejection and opens its task for a person, all or nothing.
   */
  recordCreditNoteRejected(rejection: CreditNoteRejectionRecord): Promise<void>;
  recordCreditNoteUnclear(creditNoteId: string, answeredAt: Date): Promise<void>;
  /**
   * Frees the credit note's request and, given invoicing outside the register, records it, all
   * or nothing.
   */
  releaseCreditNoteRequest(
    creditNoteId: string,
    foreignInvoicing: ExternalInvoicingRegularization | null,
  ): Promise<void>;
}

export interface OrphanCreditNoteLanes {
  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: OrphanCreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface OrphanCreditNoteRequests {
  pointOfSaleOf(creditNoteId: string): Promise<number | null>;
}

export interface CreditNoteSolicitation {
  token: WsaaToken;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  total: number;
  receiverTaxStatusCode: number;
  associatedVoucher: VoucherReference;
}

export interface TaxAuthorityCreditNoteInvoicing {
  solicit(solicitation: CreditNoteSolicitation): Promise<SolicitationAnswer>;
}

export interface IssueOrphanCreditNotePorts {
  requests: OrphanCreditNoteRequests;
  lanes: OrphanCreditNoteLanes;
  clock: Clock;
  tokens: WsaaTokenSource;
  vouchers: TaxAuthorityVoucherLookup;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
  creditNotes: TaxAuthorityCreditNoteInvoicing;
}
