import {
  type CreditNoteAnswer,
  SALE_VOIDED_EVENT_TYPE,
  type SaleVoidCreditNote,
} from "@purosur/domain";
import type { PendingCreditNote, RegisterVoidCreditNotes } from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface AuthorizedRow {
  state: "AUTHORIZED";
  point_of_sale: number;
  number: number;
  issued_on: string;
  authorization_code: string;
  authorization_code_due_on: string;
}

interface UnauthorizedRow {
  state: "IN_PROGRESS" | "REJECTED";
}

type CreditNoteRow = (AuthorizedRow | UnauthorizedRow) & {
  id: string;
  sale_id: string;
  total: number;
  receiver_tax_status_code: number;
  corrected_voucher_type: number;
  corrected_point_of_sale: number;
  corrected_number: number;
  recorded_at: string;
};

export interface StoredCreditNote extends SaleVoidCreditNote {
  recordedAt: Date;
  answer: CreditNoteAnswer;
}

function answerOf(row: CreditNoteRow): CreditNoteAnswer {
  switch (row.state) {
    case "IN_PROGRESS":
      return { kind: "in_progress" };
    case "REJECTED":
      return { kind: "rejected" };
    case "AUTHORIZED":
      return {
        kind: "authorized",
        pointOfSale: row.point_of_sale,
        number: row.number,
        issuedOn: row.issued_on,
        authorizationCode: row.authorization_code,
        authorizationCodeDueOn: row.authorization_code_due_on,
      };
  }
}

export function readCreditNoteOfSale(
  database: LocalDatabase,
  saleId: string,
): StoredCreditNote | null {
  const row = database
    .prepare<[string], CreditNoteRow>(
      `SELECT id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
              corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on,
              authorization_code, authorization_code_due_on, recorded_at
       FROM sale_void_credit_notes WHERE sale_id = ?`,
    )
    .get(saleId);
  return row === undefined
    ? null
    : {
        creditNoteId: row.id,
        saleId: row.sale_id,
        total: row.total,
        receiverTaxStatusCode: row.receiver_tax_status_code,
        correctedVoucher: {
          voucherType: row.corrected_voucher_type,
          pointOfSale: row.corrected_point_of_sale,
          number: row.corrected_number,
        },
        recordedAt: new Date(row.recorded_at),
        answer: answerOf(row),
      };
}

export function insertPendingCreditNote(
  database: LocalDatabase,
  { creditNoteId, saleId, total, receiverTaxStatusCode, correctedVoucher }: SaleVoidCreditNote,
): void {
  database
    .prepare(
      `INSERT INTO sale_void_credit_notes (
         id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
         corrected_point_of_sale, corrected_number, state, recorded_at
       )
       SELECT @id, id, @total, @receiver_tax_status_code, @voucher_type, @point_of_sale, @number,
              'IN_PROGRESS', voided_at
       FROM sales WHERE id = @sale_id AND state = 'VOIDED'`,
    )
    .run({
      id: creditNoteId,
      sale_id: saleId,
      total,
      receiver_tax_status_code: receiverTaxStatusCode,
      voucher_type: correctedVoucher.voucherType,
      point_of_sale: correctedVoucher.pointOfSale,
      number: correctedVoucher.number,
    });
}

interface InProgressRow {
  id: string;
  sale_id: string;
  total: number;
  receiver_tax_status_code: number;
  corrected_voucher_type: number;
  corrected_point_of_sale: number;
  corrected_number: number;
  event_id: string;
  device_seq: number;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  schema_version: number;
  payload: string;
  occurred_at: string;
  actor_id: string;
  chain_hmac: string;
}

export class SqliteVoidCreditNotes implements RegisterVoidCreditNotes {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async inProgress(): Promise<PendingCreditNote[]> {
    return this.database
      .prepare<[string], InProgressRow>(
        `SELECT credit_note.id, credit_note.sale_id, credit_note.total,
                credit_note.receiver_tax_status_code, credit_note.corrected_voucher_type,
                credit_note.corrected_point_of_sale, credit_note.corrected_number,
                outbox.event_id, outbox.device_seq, outbox.aggregate_type, outbox.aggregate_id,
                outbox.event_type, outbox.schema_version, outbox.payload, outbox.occurred_at,
                outbox.actor_id, outbox.chain_hmac
         FROM sale_void_credit_notes AS credit_note
         JOIN outbox ON outbox.aggregate_id = credit_note.sale_id AND outbox.event_type = ?
         WHERE credit_note.state = 'IN_PROGRESS'
         ORDER BY credit_note.recorded_at, credit_note.id`,
      )
      .all(SALE_VOIDED_EVENT_TYPE)
      .map((row) => ({
        creditNoteId: row.id,
        saleId: row.sale_id,
        total: row.total,
        receiverTaxStatusCode: row.receiver_tax_status_code,
        correctedVoucher: {
          voucherType: row.corrected_voucher_type,
          pointOfSale: row.corrected_point_of_sale,
          number: row.corrected_number,
        },
        saleEvent: {
          event_id: row.event_id,
          device_seq: row.device_seq,
          aggregate_type: row.aggregate_type,
          aggregate_id: row.aggregate_id,
          event_type: row.event_type,
          schema_version: row.schema_version,
          payload: JSON.parse(row.payload),
          occurred_at: row.occurred_at,
          actor_id: row.actor_id,
          chain_hmac: row.chain_hmac,
        },
      }));
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
    answer: Exclude<CreditNoteAnswer, { kind: "in_progress" }>,
    answeredAt: Date,
  ): Promise<void> {
    const { changes } = this.database
      .prepare(
        `UPDATE sale_void_credit_notes
         SET state = @state, point_of_sale = @point_of_sale, number = @number,
             issued_on = @issued_on, authorization_code = @authorization_code,
             authorization_code_due_on = @authorization_code_due_on, answered_at = @answered_at
         WHERE id = @id AND state = 'IN_PROGRESS'`,
      )
      .run({
        id: creditNoteId,
        state: answer.kind === "authorized" ? "AUTHORIZED" : "REJECTED",
        point_of_sale: answer.kind === "authorized" ? answer.pointOfSale : null,
        number: answer.kind === "authorized" ? answer.number : null,
        issued_on: answer.kind === "authorized" ? answer.issuedOn : null,
        authorization_code: answer.kind === "authorized" ? answer.authorizationCode : null,
        authorization_code_due_on:
          answer.kind === "authorized" ? answer.authorizationCodeDueOn : null,
        answered_at: answeredAt.toISOString(),
      });
    if (changes !== 1) {
      throw new Error("the credit note is not in progress");
    }
  }
}
