import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RECEIVED_AT } from "../fiscal/test-support/authorization-request-fixtures.js";
import {
  anUnclearDocument,
  UNCLEAR_SINCE,
} from "../fiscal/test-support/unclear-document-fixtures.js";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleUnclearOutcomeAlertStore } from "./drizzle-unclear-outcome-alert-store.js";

const MINUTE_MS = 60 * 1000;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

const store = () => new DrizzleUnclearOutcomeAlertStore(db);
const lockDocuments = () =>
  store().transaction((tx) => tx.lockUnclearDocumentsWithoutUnclearOutcomeAlert());

describe("DrizzleUnclearOutcomeAlertStore", () => {
  it("locks a document the tax authority answered unclearly, since that answer was recorded", async () => {
    const document = await anUnclearDocument(db);

    expect(await lockDocuments()).toEqual([{ ...document, unclearSince: UNCLEAR_SINCE }]);
  });

  it("locks a document recorded as not attempted, since that answer was recorded", async () => {
    const document = await anUnclearDocument(db, { answer: "not_attempted" });

    expect(await lockDocuments()).toEqual([{ ...document, unclearSince: UNCLEAR_SINCE }]);
  });

  it("locks a document with no answer yet, since the moment its call was due to be over", async () => {
    const notAfter = new Date(RECEIVED_AT.getTime() + 4_000);
    const document = await anUnclearDocument(db, { answer: null, notAfter });

    expect(await lockDocuments()).toEqual([{ ...document, unclearSince: notAfter }]);
  });

  it.each(["authorized", "rejected"] as const)(
    "leaves out a document the tax authority clearly answered as %s",
    async (answer) => {
      await anUnclearDocument(db, { answer });

      expect(await lockDocuments()).toEqual([]);
    },
  );

  it.each(["released", "adopted", "conflicting"] as const)(
    "leaves out a document whose outcome was decided as %s",
    async (decision) => {
      await anUnclearDocument(db, { decision });

      expect(await lockDocuments()).toEqual([]);
    },
  );

  it("leaves out a document that already has its alert open", async () => {
    const document = await anUnclearDocument(db);
    await db.insert(alerts).values({
      kind: "fiscal_unknown",
      scope: document.fiscalDocumentId,
      level: "warning",
      audience: "all",
      detail: {},
      openedAt: UNCLEAR_SINCE,
    });

    expect(await lockDocuments()).toEqual([]);
  });

  it("locks a document whose only alert is already resolved", async () => {
    const document = await anUnclearDocument(db);
    await db.insert(alerts).values({
      kind: "fiscal_unknown",
      scope: document.fiscalDocumentId,
      level: "warning",
      audience: "all",
      detail: {},
      openedAt: UNCLEAR_SINCE,
      resolvedAt: UNCLEAR_SINCE,
    });

    expect(await lockDocuments()).toHaveLength(1);
  });

  it("opens the alert for everyone, with the level it is given and escalating 30 minutes after the document became unclear", async () => {
    const document = await anUnclearDocument(db);
    const openedAt = new Date(UNCLEAR_SINCE.getTime() + 10 * MINUTE_MS);

    await store().transaction(async (tx) => {
      const [locked] = await tx.lockUnclearDocumentsWithoutUnclearOutcomeAlert();
      if (!locked) {
        throw new Error("test setup: no document was locked");
      }
      await tx.openUnclearOutcomeAlert(locked, "critical", openedAt);
    });

    const [alert] = await db.select().from(alerts);
    expect(alert).toMatchObject({
      kind: "fiscal_unknown",
      scope: document.fiscalDocumentId,
      level: "critical",
      audience: "all",
      locationId: null,
      openedAt,
      escalateAt: new Date(UNCLEAR_SINCE.getTime() + 30 * MINUTE_MS),
      detail: {
        fiscalDocumentId: document.fiscalDocumentId,
        saleId: document.saleId,
        registerId: document.registerId,
        pointOfSale: document.pointOfSale,
        number: document.number,
        unclearSince: UNCLEAR_SINCE.toISOString(),
      },
    });
  });

  it("opens no second alert while one is already open for the document", async () => {
    const document = await anUnclearDocument(db);
    const openIt = () =>
      store().transaction(async (tx) => {
        const [locked] = await tx.lockUnclearDocumentsWithoutUnclearOutcomeAlert();
        if (locked) {
          await tx.openUnclearOutcomeAlert(locked, "warning", UNCLEAR_SINCE);
        }
      });

    await openIt();
    await openIt();

    expect(
      await db.select().from(alerts).where(eq(alerts.scope, document.fiscalDocumentId)),
    ).toHaveLength(1);
  });
});
