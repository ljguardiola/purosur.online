import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRestoredRegisterUnclearDeferralAnswers } from "./drizzle-restored-register-unclear-deferral-answers.js";
import { anUnclearDocument, UNCLEAR_SINCE } from "./test-support/unclear-document-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let answers: DrizzleRestoredRegisterUnclearDeferralAnswers<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("restored_register_unclear_deferral_answers");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  answers = new DrizzleRestoredRegisterUnclearDeferralAnswers(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the recorded outcomes of a restored register's documents on a real Postgres", () => {
  it("holds an authorized answer with its code and when it was answered", async () => {
    const document = await anUnclearDocument(db, { answer: "authorized" });

    const found = await answers.recordedOutcomesOf(document.registerId, [
      document.fiscalDocumentId,
    ]);

    expect(found).toEqual([
      {
        fiscalDocumentId: document.fiscalDocumentId,
        outcome: {
          answer: {
            kind: "authorized",
            authorizationCode: "75123456789012",
            authorizationCodeDueOn: "2026-10-16",
          },
          decision: null,
        },
        answeredAt: UNCLEAR_SINCE,
        decidedAt: null,
      },
    ]);
  });

  it("holds a rejected answer", async () => {
    const document = await anUnclearDocument(db, { answer: "rejected" });

    const found = await answers.recordedOutcomesOf(document.registerId, [
      document.fiscalDocumentId,
    ]);

    expect(found[0]?.outcome).toEqual({
      answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
      decision: null,
    });
  });

  it("holds the decision made about a document that stayed unclear, and when it was made", async () => {
    const decidedAt = new Date("2026-10-06T16:00:00.000Z");
    const document = await anUnclearDocument(db, {
      answer: "unclear",
      decision: "adopted",
      decidedAt,
    });

    const found = await answers.recordedOutcomesOf(document.registerId, [
      document.fiscalDocumentId,
    ]);

    expect(found).toEqual([
      {
        fiscalDocumentId: document.fiscalDocumentId,
        outcome: {
          answer: { kind: "unclear" },
          decision: {
            kind: "adopted",
            authorizationCode: "75123456789012",
            authorizationCodeDueOn: "2026-10-16",
          },
        },
        answeredAt: UNCLEAR_SINCE,
        decidedAt,
      },
    ]);
  });

  it("holds a request that has no answer yet", async () => {
    const document = await anUnclearDocument(db, { answer: null });

    const found = await answers.recordedOutcomesOf(document.registerId, [
      document.fiscalDocumentId,
    ]);

    expect(found).toEqual([
      {
        fiscalDocumentId: document.fiscalDocumentId,
        outcome: { answer: null, decision: null },
        answeredAt: null,
        decidedAt: null,
      },
    ]);
  });

  it("holds only the documents asked for", async () => {
    const asked = await anUnclearDocument(db, { answer: "unclear" });
    await anUnclearDocument(db, { answer: "unclear" });

    const found = await answers.recordedOutcomesOf(asked.registerId, [asked.fiscalDocumentId]);

    expect(found.map(({ fiscalDocumentId }) => fiscalDocumentId)).toEqual([asked.fiscalDocumentId]);
  });

  it("does not hold another register's request, even asked for by its document id", async () => {
    const other = await anUnclearDocument(db, { answer: "authorized" });
    const own = await anUnclearDocument(db, { answer: "unclear" });

    const found = await answers.recordedOutcomesOf(own.registerId, [other.fiscalDocumentId]);

    expect(found).toEqual([]);
  });

  it("holds nothing for a document the register never asked the tax authority about", async () => {
    const own = await anUnclearDocument(db, { answer: "unclear" });

    await expect(
      answers.recordedOutcomesOf(own.registerId, [crypto.randomUUID()]),
    ).resolves.toEqual([]);
  });
});
