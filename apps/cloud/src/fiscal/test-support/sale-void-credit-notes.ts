import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { creditNotes } from "../../platform/db/schema.js";

export const REQUESTED_AT = new Date("2026-10-07T10:29:00.000Z");
export const ANSWERED_AT = new Date("2026-10-07T10:30:00.000Z");

let nextVoucherNumber = 1;
let nextAnswerNumber = 100;

export function anAuthorizedAnswer(number = nextAnswerNumber++) {
  return {
    number,
    issuedOn: "2026-10-07",
    requestedAt: REQUESTED_AT,
    answerKind: "authorized",
    answeredAt: ANSWERED_AT,
    authorizationCode: "74123456789012",
    authorizationCodeDueOn: "2026-10-17",
  };
}

export function aRejectedAnswer(number = nextAnswerNumber++) {
  return {
    number,
    issuedOn: "2026-10-07",
    requestedAt: REQUESTED_AT,
    answerKind: "rejected",
    answeredAt: ANSWERED_AT,
    rejections: [],
  };
}

export function anUnclearAnswer(number = nextAnswerNumber++) {
  return {
    number,
    issuedOn: "2026-10-07",
    requestedAt: REQUESTED_AT,
    answerKind: "unclear",
    answeredAt: ANSWERED_AT,
  };
}

export async function insertSaleVoidCreditNote<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  registerId: string,
  saleId: string,
  overrides: Partial<typeof creditNotes.$inferInsert> = {},
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(creditNotes).values({
    id,
    registerId,
    saleId,
    reason: "sale_void",
    pointOfSale: 7,
    associatedVoucherType: 11,
    associatedPointOfSale: 31,
    associatedNumber: nextVoucherNumber++,
    total: 4800,
    receiverTaxStatusCode: 5,
    createdAt: REQUESTED_AT,
    ...overrides,
  });
  return id;
}
