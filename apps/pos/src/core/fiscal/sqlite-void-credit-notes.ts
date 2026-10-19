import {
  type PushedEvent,
  SALE_VOIDED_EVENT_TYPE,
  type SaleVoidCreditNote,
  type VoidCreditNoteStanding,
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
  state: "IN_PROGRESS" | "REJECTED" | "ALREADY_CREDITED";
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
  answered_at: string | null;
};

export interface StoredCreditNote extends SaleVoidCreditNote {
  recordedAt: Date;
  answeredAt: Date | null;
  answer: VoidCreditNoteStanding;
}

function answerOf(row: CreditNoteRow): VoidCreditNoteStanding {
  switch (row.state) {
    case "IN_PROGRESS":
      return { kind: "in_progress" };
    case "REJECTED":
      return { kind: "rejected" };
    case "ALREADY_CREDITED":
      return { kind: "already_credited" };
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
              authorization_code, authorization_code_due_on, recorded_at, answered_at
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
        answeredAt: row.answered_at === null ? null : new Date(row.answered_at),
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

const STATES = {
  authorized: "AUTHORIZED",
  rejected: "REJECTED",
  already_credited: "ALREADY_CREDITED",
} as const;

interface InProgressRow {
  id: string;
  sale_id: string;
  total: number;
  receiver_tax_status_code: number;
  corrected_voucher_type: number;
  corrected_point_of_sale: number;
  corrected_number: number;
}

interface SaleEventRow extends Omit<PushedEvent, "payload"> {
  payload: string;
}

export class SqliteVoidCreditNotes implements RegisterVoidCreditNotes {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async inProgress(): Promise<PendingCreditNote[]> {
    return this.database
      .prepare<[], InProgressRow>(
        `SELECT id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
                corrected_point_of_sale, corrected_number
         FROM sale_void_credit_notes
         WHERE state = 'IN_PROGRESS'
         ORDER BY recorded_at, id`,
      )
      .all()
      .flatMap((row) => {
        const saleEvent = this.saleVoidedEvent(row.sale_id);
        return saleEvent === null
          ? []
          : [
              {
                creditNoteId: row.id,
                saleId: row.sale_id,
                total: row.total,
                receiverTaxStatusCode: row.receiver_tax_status_code,
                correctedVoucher: {
                  voucherType: row.corrected_voucher_type,
                  pointOfSale: row.corrected_point_of_sale,
                  number: row.corrected_number,
                },
                saleEvent,
              },
            ];
      });
  }

  private saleVoidedEvent(saleId: string): PushedEvent | null {
    const row = this.database
      .prepare<[string, string], SaleEventRow>(
        `SELECT event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
                payload, occurred_at, actor_id, chain_hmac
           FROM outbox
          WHERE event_type = ? AND aggregate_id = ?`,
      )
      .get(SALE_VOIDED_EVENT_TYPE, saleId);
    return row === undefined ? null : { ...row, payload: JSON.parse(row.payload) };
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
    answer: Exclude<VoidCreditNoteStanding, { kind: "in_progress" }>,
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
        state: STATES[answer.kind],
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
