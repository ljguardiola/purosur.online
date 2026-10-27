import {
  type CreditNoteToIssue,
  type OfflineCreditNote,
  type PushedEvent,
  type RequestedCreditNoteAnswer,
  SALE_RETURNED_EVENT_TYPE,
  SALE_VOIDED_EVENT_TYPE,
  type VoidCreditNoteStanding,
} from "@purosur/domain";
import type { PendingCreditNote, RegisterCreditNotes } from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";

import { readUncancelledDeferredSaleRecord } from "./sqlite-deferred-sales";
import { readSaleInvoices } from "./sqlite-sale-invoices";

interface AuthorizedRow {
  state: "AUTHORIZED";
  point_of_sale: number;
  number: number;
  issued_on: string;
  issued_at: string;
  authorization_code: string;
  authorization_code_due_on: string;
}

interface UnauthorizedRow {
  state:
    | "IN_PROGRESS"
    | "AWAITING_INVOICE"
    | "REJECTED"
    | "ALREADY_CREDITED"
    | "REGULARIZATION_REQUIRED";
}

interface IssuedOfflineRow {
  state: "ISSUED_OFFLINE";
  offline_point_of_sale: number;
  offline_number: number;
  offline_issued_on: string;
  offline_generated_at: string;
  offline_authorization_code: string;
  offline_fortnight_start: string;
  offline_fortnight_end: string;
}

interface NoteColumns {
  id: string;
  sale_id: string;
  return_id: string | null;
  requested_issue_on: string | null;
  total: number;
  receiver_tax_status_code: number | null;
  corrected_voucher_type: number | null;
  corrected_point_of_sale: number | null;
  corrected_number: number | null;
}

type CreditNoteRow = (AuthorizedRow | UnauthorizedRow | IssuedOfflineRow) &
  NoteColumns & {
    recorded_at: string;
    answered_at: string | null;
  };

export type StoredCreditNote = CreditNoteToIssue & {
  recordedAt: Date;
  answeredAt: Date | null;
  answer: VoidCreditNoteStanding;
};

function originOf({ return_id: returnId, requested_issue_on: issuedOn }: NoteColumns) {
  return returnId === null || issuedOn === null
    ? ({ kind: "sale_void" } as const)
    : ({ kind: "sale_return", returnId, issuedOn } as const);
}

function noteOf(row: NoteColumns): CreditNoteToIssue {
  const base = {
    creditNoteId: row.id,
    saleId: row.sale_id,
    total: row.total,
    origin: originOf(row),
  };
  if (
    row.receiver_tax_status_code === null ||
    row.corrected_voucher_type === null ||
    row.corrected_point_of_sale === null ||
    row.corrected_number === null
  ) {
    return { ...base, receiverTaxStatusCode: null, correctedVoucher: null };
  }
  return {
    ...base,
    receiverTaxStatusCode: row.receiver_tax_status_code,
    correctedVoucher: {
      voucherType: row.corrected_voucher_type,
      pointOfSale: row.corrected_point_of_sale,
      number: row.corrected_number,
    },
  };
}

type CorrectedInvoice = Parameters<RegisterCreditNotes["tieToInvoice"]>[1];
export type SaleInvoiceStanding = Awaited<ReturnType<RegisterCreditNotes["saleInvoiceStanding"]>>;

const NOTE_COLUMNS = `notes.id, notes.sale_id, notes.return_id, notes.requested_issue_on, notes.total,
              notes.receiver_tax_status_code, notes.corrected_voucher_type,
              notes.corrected_point_of_sale, notes.corrected_number`;

function answerOf(row: CreditNoteRow): VoidCreditNoteStanding {
  switch (row.state) {
    case "IN_PROGRESS":
    case "AWAITING_INVOICE":
      return { kind: "in_progress" };
    case "REJECTED":
      return { kind: "rejected" };
    case "REGULARIZATION_REQUIRED":
      return { kind: "regularization_required" };
    case "ALREADY_CREDITED":
      return { kind: "already_credited" };
    case "AUTHORIZED":
      return {
        kind: "authorized",
        pointOfSale: row.point_of_sale,
        number: row.number,
        issuedOn: row.issued_on,
        issuedAt: new Date(row.issued_at),
        authorizationCode: row.authorization_code,
        authorizationCodeDueOn: row.authorization_code_due_on,
      };
    case "ISSUED_OFFLINE":
      return {
        kind: "issued_offline",
        pointOfSale: row.offline_point_of_sale,
        number: row.offline_number,
        issuedOn: row.offline_issued_on,
        issuedAt: new Date(row.offline_generated_at),
        offlineAuthorizationCode: row.offline_authorization_code,
        fortnight: { start: row.offline_fortnight_start, end: row.offline_fortnight_end },
      };
  }
}

function readCreditNote(
  database: LocalDatabase,
  condition: "notes.id = ?" | "notes.sale_id = ? AND notes.return_id IS NULL",
  value: string,
): StoredCreditNote | null {
  const row = database
    .prepare<[string], CreditNoteRow>(
      `SELECT ${NOTE_COLUMNS},
              notes.state, notes.point_of_sale, notes.number, notes.issued_on, notes.issued_at,
              notes.authorization_code, notes.authorization_code_due_on, notes.recorded_at,
              notes.answered_at,
              documents.point_of_sale AS offline_point_of_sale,
              documents.number AS offline_number,
              documents.issued_on AS offline_issued_on,
              documents.generated_at AS offline_generated_at,
              documents.offline_authorization_code,
              documents.fortnight_start AS offline_fortnight_start,
              documents.fortnight_end AS offline_fortnight_end
       FROM sale_credit_notes AS notes
       LEFT JOIN offline_fiscal_documents AS documents
         ON documents.id = notes.offline_fiscal_document_id
       WHERE ${condition}`,
    )
    .get(value);
  return row === undefined
    ? null
    : {
        ...noteOf(row),
        recordedAt: new Date(row.recorded_at),
        answeredAt: row.answered_at === null ? null : new Date(row.answered_at),
        answer: answerOf(row),
      };
}

export function readCreditNoteOfSale(
  database: LocalDatabase,
  saleId: string,
): StoredCreditNote | null {
  return readCreditNote(database, "notes.sale_id = ? AND notes.return_id IS NULL", saleId);
}

export function readCreditNoteById(
  database: LocalDatabase,
  creditNoteId: string,
): StoredCreditNote | null {
  return readCreditNote(database, "notes.id = ?", creditNoteId);
}

export function readSaleInvoiceStanding(
  database: LocalDatabase,
  saleId: string,
): SaleInvoiceStanding {
  const deferred = readUncancelledDeferredSaleRecord(database, saleId);
  return {
    fiscalDocuments: readSaleInvoices(database, saleId),
    deferralPending: deferred !== null && !deferred.satisfied,
  };
}

export function insertCreditNoteIssuedOffline(
  database: LocalDatabase,
  {
    creditNoteId,
    saleId,
    total,
    receiverTaxStatusCode,
    corrects,
    id,
    generatedAt,
  }: OfflineCreditNote,
  forReturn: { returnId: string; issuedOn: string } | null = null,
): void {
  database
    .prepare(
      `INSERT INTO sale_credit_notes (
         id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code,
         corrected_voucher_type, corrected_point_of_sale, corrected_number, state, recorded_at,
         answered_at, offline_fiscal_document_id
       ) VALUES (
         @id, @sale_id, @return_id, @requested_issue_on, @total, @receiver_tax_status_code,
         @voucher_type, @point_of_sale, @number, 'ISSUED_OFFLINE', @recorded_at, @recorded_at,
         @offline_fiscal_document_id
       )`,
    )
    .run({
      id: creditNoteId,
      sale_id: saleId,
      return_id: forReturn?.returnId ?? null,
      requested_issue_on: forReturn?.issuedOn ?? null,
      total,
      receiver_tax_status_code: receiverTaxStatusCode,
      voucher_type: corrects.voucherType,
      point_of_sale: corrects.pointOfSale,
      number: corrects.number,
      recorded_at: generatedAt.toISOString(),
      offline_fiscal_document_id: id,
    });
}

export function insertPendingCreditNote(
  database: LocalDatabase,
  {
    creditNoteId,
    saleId,
    total,
    receiverTaxStatusCode,
    correctedVoucher,
    origin,
  }: CreditNoteToIssue,
): void {
  const fromReturn = origin.kind === "sale_return";
  database
    .prepare(
      `INSERT INTO sale_credit_notes (
         id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code,
         corrected_voucher_type, corrected_point_of_sale, corrected_number, state, recorded_at
       )
       SELECT @id, @sale_id, @return_id, @requested_issue_on, @total, @receiver_tax_status_code,
              @voucher_type, @point_of_sale, @number, @state, ${
                fromReturn ? "returns.occurred_at" : "sales.voided_at"
              }
       FROM ${fromReturn ? "returns WHERE returns.id = @return_id" : "sales WHERE sales.id = @sale_id AND sales.state = 'VOIDED'"}`,
    )
    .run({
      id: creditNoteId,
      sale_id: saleId,
      return_id: origin.kind === "sale_return" ? origin.returnId : null,
      requested_issue_on: origin.kind === "sale_return" ? origin.issuedOn : null,
      total,
      receiver_tax_status_code: receiverTaxStatusCode,
      voucher_type: correctedVoucher?.voucherType ?? null,
      point_of_sale: correctedVoucher?.pointOfSale ?? null,
      number: correctedVoucher?.number ?? null,
      state: correctedVoucher === null ? "AWAITING_INVOICE" : "IN_PROGRESS",
    });
}

const STATES = {
  authorized: "AUTHORIZED",
  rejected: "REJECTED",
  already_credited: "ALREADY_CREDITED",
  regularization_required: "REGULARIZATION_REQUIRED",
} as const;

export function writeCreditNoteAnswer(
  database: LocalDatabase,
  creditNoteId: string,
  answer: RequestedCreditNoteAnswer,
  answeredAt: Date,
): number {
  return database
    .prepare(
      `UPDATE sale_credit_notes
       SET state = @state, point_of_sale = @point_of_sale, number = @number,
           issued_on = @issued_on, issued_at = @issued_at,
           authorization_code = @authorization_code,
           authorization_code_due_on = @authorization_code_due_on, answered_at = @answered_at
       WHERE id = @id AND state IN ('IN_PROGRESS', 'AWAITING_INVOICE')`,
    )
    .run({
      id: creditNoteId,
      state: STATES[answer.kind],
      point_of_sale: answer.kind === "authorized" ? answer.pointOfSale : null,
      number: answer.kind === "authorized" ? answer.number : null,
      issued_on: answer.kind === "authorized" ? answer.issuedOn : null,
      issued_at: answer.kind === "authorized" ? answer.issuedAt.toISOString() : null,
      authorization_code: answer.kind === "authorized" ? answer.authorizationCode : null,
      authorization_code_due_on:
        answer.kind === "authorized" ? answer.authorizationCodeDueOn : null,
      answered_at: answeredAt.toISOString(),
    }).changes;
}

type InProgressRow = NoteColumns;

interface SaleEventRow extends Omit<PushedEvent, "payload"> {
  payload: string;
}

export class SqliteSaleCreditNotes implements RegisterCreditNotes {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async inProgress(): Promise<PendingCreditNote[]> {
    return this.database
      .prepare<[], InProgressRow>(
        `SELECT ${NOTE_COLUMNS}
         FROM sale_credit_notes AS notes
         WHERE notes.state IN ('IN_PROGRESS', 'AWAITING_INVOICE')
         ORDER BY notes.recorded_at, notes.id`,
      )
      .all()
      .flatMap((row) => this.pendingOf(row));
  }

  async pendingCreditNote(creditNoteId: string): Promise<PendingCreditNote | null> {
    const row = this.database
      .prepare<[string], InProgressRow>(
        `SELECT ${NOTE_COLUMNS}
         FROM sale_credit_notes AS notes
         WHERE notes.id = ? AND notes.state IN ('IN_PROGRESS', 'AWAITING_INVOICE')`,
      )
      .get(creditNoteId);
    return row === undefined ? null : (this.pendingOf(row)[0] ?? null);
  }

  async recordedAnswer(creditNoteId: string): Promise<VoidCreditNoteStanding | null> {
    return readCreditNoteById(this.database, creditNoteId)?.answer ?? null;
  }

  private pendingOf(row: InProgressRow): PendingCreditNote[] {
    const saleEvent = this.ownEvent(row) ?? this.replenishedRequestEvent(row.id);
    return saleEvent === null ? [] : [{ ...noteOf(row), saleEvent }];
  }

  private ownEvent({ return_id: returnId, sale_id: saleId }: NoteColumns): PushedEvent | null {
    const row = this.database
      .prepare<[string, string], SaleEventRow>(
        `SELECT event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
                payload, occurred_at, actor_id, chain_hmac
           FROM outbox
          WHERE event_type = ? AND aggregate_id = ?`,
      )
      .get(
        returnId === null ? SALE_VOIDED_EVENT_TYPE : SALE_RETURNED_EVENT_TYPE,
        returnId ?? saleId,
      );
    return row === undefined ? null : { ...row, payload: JSON.parse(row.payload) };
  }

  private replenishedRequestEvent(creditNoteId: string): PushedEvent | null {
    const row = this.database
      .prepare<[string], SaleEventRow>(
        `SELECT event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
                payload, occurred_at, actor_id, chain_hmac
           FROM replenished_credit_note_requests
          WHERE credit_note_id = ?`,
      )
      .get(creditNoteId);
    return row === undefined ? null : { ...row, payload: JSON.parse(row.payload) };
  }

  async saleInvoiceStanding(saleId: string): Promise<SaleInvoiceStanding> {
    return readSaleInvoiceStanding(this.database, saleId);
  }

  async tieToInvoice(creditNoteId: string, { voucher, buyerTaxStatusCode }: CorrectedInvoice) {
    this.database
      .prepare(
        `UPDATE sale_credit_notes
         SET receiver_tax_status_code = @receiver_tax_status_code,
             corrected_voucher_type = @voucher_type,
             corrected_point_of_sale = @point_of_sale,
             corrected_number = @number,
             state = 'IN_PROGRESS'
         WHERE id = @id AND state = 'AWAITING_INVOICE'`,
      )
      .run({
        id: creditNoteId,
        receiver_tax_status_code: buyerTaxStatusCode,
        voucher_type: voucher.voucherType,
        point_of_sale: voucher.pointOfSale,
        number: voucher.number,
      });
  }

  async realTimePointOfSale(): Promise<number | null> {
    return (
      this.database
        .prepare<[], { point_of_sale: number }>(
          `SELECT register_point_of_sale.point_of_sale_number AS point_of_sale
           FROM register_point_of_sale
           JOIN own_register ON own_register.id = register_point_of_sale.register_id
           WHERE own_register.removed = 0`,
        )
        .get()?.point_of_sale ?? null
    );
  }

  async recordAnswer(
    creditNoteId: string,
    answer: RequestedCreditNoteAnswer,
    answeredAt: Date,
  ): Promise<void> {
    const changes = writeCreditNoteAnswer(this.database, creditNoteId, answer, answeredAt);
    if (changes === 0 && (await this.recordedAnswer(creditNoteId)) === null) {
      throw new Error(`the register holds no credit note ${creditNoteId}`);
    }
  }
}
