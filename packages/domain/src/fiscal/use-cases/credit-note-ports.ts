import type { Clock } from "../../shared/index.js";
import type { CreditNoteReason } from "../model/credit-note.js";
import type { TaxAuthorityRejection } from "../model/fiscal-rejection-standing.js";
import type { FiscalTask } from "../model/fiscal-task.js";
import type {
  ExternalInvoicingRegularization,
  VoucherReference,
} from "../model/orphan-authorization.js";
import type { CreditNoteStanding } from "../model/sale-void-credit-note.js";
import type { SolicitationAnswer, WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type { TaxAuthorityLastAuthorizedLookup } from "./tax-authority-count-ports.js";
import type { TaxAuthorityVoucherLookup } from "./unclear-outcome-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export type { CreditNoteStanding };

export class CreditNoteNumberTaken extends Error {}

export interface CreditNote {
  creditNoteId: string;
  pointOfSale: number;
  associatedVoucher: VoucherReference;
  total: number;
  receiverTaxStatusCode: number;
  reason: CreditNoteReason;
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

export interface CreditNoteLane {
  creditNote(creditNoteId: string): Promise<CreditNote | null>;
  otherCreditNoteStandings(creditNoteId: string): Promise<CreditNoteStanding[]>;
  /**
   * Raises CreditNoteNumberTaken when another credit note of the point of sale already holds the
   * number.
   */
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

export interface CreditNoteLanes {
  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: CreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface CreditNoteRequests {
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

export interface IssueCreditNotePorts {
  requests: CreditNoteRequests;
  lanes: CreditNoteLanes;
  clock: Clock;
  tokens: WsaaTokenSource;
  vouchers: TaxAuthorityVoucherLookup;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
  creditNotes: TaxAuthorityCreditNoteInvoicing;
}
