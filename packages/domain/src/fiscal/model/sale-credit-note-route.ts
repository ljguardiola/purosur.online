import type { OutboxEventDraft, ZoneRules } from "../../shared/index.js";
import { creditNoteIssueDate } from "./credit-note.js";
import {
  type FiscalOnlineSignalEvidence,
  isRegisterFiscallyOnline,
} from "./fiscal-online-signal.js";
import type { FiscalTaskDocumentType } from "./fiscal-task.js";
import { CREDIT_NOTE_C_DOCUMENT_TYPE } from "./fiscal-voucher-type.js";
import type { Fortnight } from "./offline-authorization-code.js";
import {
  type OfflineCreditNote,
  offlineCreditNote,
  offlineCreditNoteIssuedEvent,
} from "./offline-fiscal-document.js";
import {
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
  invoiceOwnFortnight,
  type OfflineSeries,
  offlineRoute,
} from "./real-time-authorization.js";
import { raisedClockMark } from "./register-clock.js";
import type {
  CorrectedInvoice,
  CreditNoteOrigin,
  CreditNoteToIssue,
  InvoicedCreditNote,
  SaleInvoice,
} from "./sale-credit-note.js";

export interface SaleInvoiceStanding {
  fiscalDocuments: readonly SaleInvoice[];
  deferralPending: boolean;
}

export function isInvoiceOnItsWay({ fiscalDocuments, deferralPending }: SaleInvoiceStanding) {
  return (
    deferralPending ||
    fiscalDocuments.some(({ state }) => IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(state))
  );
}

export interface OfflineCreditNoteClockMark {
  pointOfSale: number;
  documentType: FiscalTaskDocumentType;
  reading: Date;
}

export interface CreditNoteRoutingFacts {
  fiscalOnlineEvidence(): FiscalOnlineSignalEvidence;
  offlineCreditNoteSeries(): OfflineSeries;
  offlineAuthorizationCodeOf(fortnight: Fortnight): string | null;
}

export interface CreditNoteRecorder {
  recordPendingCreditNote(creditNote: CreditNoteToIssue): void;
  issueOfflineCreditNote(document: OfflineCreditNote): void;
  recordClockMark(mark: OfflineCreditNoteClockMark): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}

export type SaleCreditNoteTransaction = CreditNoteRoutingFacts & CreditNoteRecorder;

type SaleCreditNoteOriginRequest =
  | { kind: "sale_void" }
  | { kind: "sale_return"; returnId: string };

export interface SaleCreditNoteRoutingInput {
  occurredAt: Date;
  saleId: string;
  total: number;
  origin: SaleCreditNoteOriginRequest;
  invoice: CorrectedInvoice | null;
  invoiceOnItsWay: boolean;
  nextCreditNoteId: () => string;
}

export type SaleCreditNoteRoute =
  | { kind: "none" }
  | { kind: "pending"; creditNote: InvoicedCreditNote }
  | { kind: "awaiting_invoice"; creditNote: CreditNoteToIssue }
  | {
      kind: "issue_offline";
      creditNote: InvoicedCreditNote;
      offline: {
        pointOfSale: number;
        number: number;
        issuedOn: string;
        fortnight: Fortnight;
        offlineAuthorizationCode: string;
      };
      clockMark: OfflineCreditNoteClockMark;
    };

function originOf(
  origin: SaleCreditNoteOriginRequest,
  occurredAt: Date,
  rules: ZoneRules,
): CreditNoteOrigin {
  return origin.kind === "sale_void"
    ? origin
    : { ...origin, issuedOn: creditNoteIssueDate(occurredAt, rules) };
}

export function routeSaleCreditNote(
  {
    occurredAt,
    saleId,
    total,
    origin,
    invoice,
    invoiceOnItsWay,
    nextCreditNoteId,
  }: SaleCreditNoteRoutingInput,
  facts: CreditNoteRoutingFacts,
  rules: ZoneRules,
): SaleCreditNoteRoute {
  if (total <= 0) {
    return { kind: "none" };
  }
  if (invoice === null) {
    return invoiceOnItsWay
      ? {
          kind: "awaiting_invoice",
          creditNote: {
            creditNoteId: nextCreditNoteId(),
            saleId,
            total,
            receiverTaxStatusCode: null,
            correctedVoucher: null,
            origin: originOf(origin, occurredAt, rules),
          },
        }
      : { kind: "none" };
  }
  const creditNote: InvoicedCreditNote = {
    creditNoteId: nextCreditNoteId(),
    saleId,
    total,
    receiverTaxStatusCode: invoice.buyerTaxStatusCode,
    correctedVoucher: invoice.voucher,
    origin: originOf(origin, occurredAt, rules),
  };
  if (isRegisterFiscallyOnline(facts.fiscalOnlineEvidence(), occurredAt)) {
    return { kind: "pending", creditNote };
  }
  const series = facts.offlineCreditNoteSeries();
  const offline = offlineRoute({
    occurredAt,
    series,
    offlineAuthorizationCode: facts.offlineAuthorizationCodeOf(
      invoiceOwnFortnight(occurredAt, rules),
    ),
    rules,
  });
  if (offline.kind !== "issue_offline") {
    return { kind: "pending", creditNote };
  }
  const { kind: _kind, pointOfSale, ...issuance } = offline;
  return {
    kind: "issue_offline",
    creditNote,
    offline: { pointOfSale, ...issuance },
    clockMark: {
      pointOfSale,
      documentType: CREDIT_NOTE_C_DOCUMENT_TYPE,
      reading: raisedClockMark(series.clockMark, occurredAt),
    },
  };
}

export function issueOfflineSaleCreditNote(
  { creditNote, offline, clockMark }: Extract<SaleCreditNoteRoute, { kind: "issue_offline" }>,
  tx: CreditNoteRecorder,
  {
    nextId,
    registerId,
    actorId,
    generatedAt,
    rules,
  }: {
    nextId: () => string;
    registerId: string;
    actorId: string;
    generatedAt: Date;
    rules: ZoneRules;
  },
): void {
  const document = offlineCreditNote(
    {
      id: nextId(),
      saleId: creditNote.saleId,
      creditNoteId: creditNote.creditNoteId,
      pointOfSale: offline.pointOfSale,
      number: offline.number,
      issuedOn: offline.issuedOn,
      generatedAt,
      offlineAuthorizationCode: offline.offlineAuthorizationCode,
      fortnight: offline.fortnight,
      total: creditNote.total,
      receiverTaxStatusCode: creditNote.receiverTaxStatusCode,
      corrects: creditNote.correctedVoucher,
      cause: "no_connectivity",
    },
    rules,
  );
  tx.issueOfflineCreditNote(document);
  tx.recordClockMark(clockMark);
  tx.appendOutboxEvent(
    offlineCreditNoteIssuedEvent({ eventId: nextId(), registerId, actorId, document }),
  );
}
