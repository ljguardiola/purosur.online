import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fiscalRequests } from "../../platform/db/schema.js";

const REQUESTED_AT = new Date("2026-10-06T15:00:00.000Z");

export async function insertRealTimeInvoice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    registerId,
    pointOfSale,
    number,
    total,
    answer = { answerKind: "authorized", authorizationCode: "74123456789012" },
  }: {
    registerId: string;
    pointOfSale: number;
    number: number;
    total: number;
    answer?:
      | { answerKind: "authorized"; authorizationCode: string }
      | { answerKind: "unclear" }
      | { answerKind: "unclear"; adoptedAuthorizationCode: string }
      | { answerKind: "rejected" };
  },
): Promise<void> {
  const answered = {
    answeredAt: REQUESTED_AT,
    ...(answer.answerKind === "authorized"
      ? {
          answerKind: "authorized",
          authorizationCode: answer.authorizationCode,
          authorizationCodeDueOn: "2026-10-16",
        }
      : answer.answerKind === "rejected"
        ? { answerKind: "rejected", rejectionCodes: [10015], rejectionClass: "content" }
        : {
            answerKind: "unclear",
            unclearCodes: [],
            ...("adoptedAuthorizationCode" in answer
              ? {
                  decision: "adopted",
                  decidedAt: REQUESTED_AT,
                  adoptedAuthorizationCode: answer.adoptedAuthorizationCode,
                  adoptedAuthorizationCodeDueOn: "2026-10-16",
                }
              : {}),
          }),
  };
  await db.insert(fiscalRequests).values({
    fiscalDocumentId: crypto.randomUUID(),
    registerId,
    saleId: crypto.randomUUID(),
    pointOfSale,
    number,
    issuedOn: "2026-10-06",
    total,
    buyerTaxStatusCode: 5,
    receivedAt: REQUESTED_AT,
    notAfter: new Date(REQUESTED_AT.getTime() + 4_000),
    ...answered,
  });
}
