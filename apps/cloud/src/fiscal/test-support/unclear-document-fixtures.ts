import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fiscalRequests } from "../../platform/db/schema.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
  RECEIVED_AT,
} from "./authorization-request-fixtures.js";

export const UNCLEAR_SINCE = new Date("2026-10-06T15:00:30.000Z");

interface UnclearDocumentOptions {
  answer?: "unclear" | "not_attempted" | "authorized" | "rejected" | null;
  answeredAt?: Date;
  notAfter?: Date;
  decision?: "released" | "adopted" | "conflicting" | null;
  decidedAt?: Date;
}

export interface SeededUnclearDocument {
  fiscalDocumentId: string;
  saleId: string;
  registerId: string;
  pointOfSale: number;
  number: number;
}

let seeded = 0;

function answerColumns(answer: UnclearDocumentOptions["answer"]) {
  switch (answer) {
    case "authorized":
      return { authorizationCode: "75123456789012", authorizationCodeDueOn: "2026-10-16" };
    case "rejected":
      return { rejectionCodes: [10015], rejectionClass: "content" };
    case "unclear":
      return { unclearCodes: [] };
    default:
      return {};
  }
}

export async function anUnclearDocument<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    answer = "unclear",
    answeredAt = UNCLEAR_SINCE,
    notAfter = new Date(RECEIVED_AT.getTime() + 4_000),
    decision = null,
    decidedAt = new Date(UNCLEAR_SINCE.getTime() + 60_000),
  }: UnclearDocumentOptions = {},
): Promise<SeededUnclearDocument> {
  seeded += 1;
  const pointOfSale = 1_000 + seeded;
  const registerId = await insertRegisterWithPointOfSale(db, {
    pointOfSaleNumber: pointOfSale,
    name: `unclear-${pointOfSale}-${crypto.randomUUID()}`,
  });
  const { fiscalDocumentId, saleId, number, ...request } = authorizationRequestRecord(registerId, {
    pointOfSale,
    number: seeded,
    notAfter,
  });
  await db.insert(fiscalRequests).values({
    ...request,
    fiscalDocumentId,
    saleId,
    number,
    answerKind: answer,
    answeredAt: answer === null ? null : answeredAt,
    ...answerColumns(answer),
    decision,
    decidedAt: decision === null ? null : decidedAt,
    adoptedAuthorizationCode: decision === "adopted" ? "75123456789012" : null,
    adoptedAuthorizationCodeDueOn: decision === "adopted" ? "2026-10-16" : null,
  });
  return { fiscalDocumentId, saleId, registerId, pointOfSale, number };
}
