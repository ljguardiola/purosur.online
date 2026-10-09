import type { RealTimeAuthorizationResolved } from "@purosur/domain/fiscal/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import { SqliteRealTimeFiscalDocuments } from "./sqlite-real-time-fiscal-documents";
import {
  FACTURA_C,
  insertCompletedSale,
  insertFiscalDocument,
  insertSaleCompletedEvent,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

const RESOLVED_AT = new Date("2026-09-30T12:05:03.000Z");

let database: LocalDatabase;
let documents: SqliteRealTimeFiscalDocuments;

function resolution(
  resolved: Pick<RealTimeAuthorizationResolved, "resolution">,
  fiscalDocumentId = "doc-1",
): RealTimeAuthorizationResolved {
  return { fiscalDocumentId, saleId: "sale-1", resolvedAt: RESOLVED_AT, ...resolved };
}

function storedDocument() {
  return database
    .prepare(
      `SELECT state, authorization_code, authorization_code_due_on, resolved_at
       FROM fiscal_documents WHERE id = 'doc-1'`,
    )
    .get();
}

function routings() {
  return database.prepare("SELECT sale_id, reason, routed_at FROM deferred_sales").all();
}

beforeEach(() => {
  database = openFiscalDatabase();
  insertCompletedSale(database, "sale-1");
  insertSaleCompletedEvent(database, "sale-1");
  insertFiscalDocument(database);
  documents = new SqliteRealTimeFiscalDocuments(database);
});

afterEach(() => {
  database.close();
});

describe("the document waiting on a real-time answer", () => {
  it("is the reserved document with the event of the sale as it travels to the cloud", async () => {
    const [saleEvent] = await new SqliteLocalOutbox(database, () => RESOLVED_AT).unacknowledged(10);

    await expect(documents.waitingDocumentOfSale("sale-1")).resolves.toEqual({
      fiscalDocumentId: "doc-1",
      saleId: "sale-1",
      pointOfSale: POINT_OF_SALE,
      number: 41,
      issuedOn: "2026-09-30",
      document: FACTURA_C,
      saleEvent,
    });
    expect(saleEvent).toMatchObject({ event_type: "sale_completed", aggregate_id: "sale-1" });
  });

  it("carries the event of its own sale among the events of others", async () => {
    insertCompletedSale(database, "sale-2");
    insertSaleCompletedEvent(database, "sale-2");

    const waiting = await documents.waitingDocumentOfSale("sale-1");

    expect(waiting?.saleEvent?.aggregate_id).toBe("sale-1");
  });

  it("still carries the event once the regular push acknowledged it", async () => {
    database.prepare("UPDATE outbox SET acked_at = '2026-09-30T12:05:01.000Z'").run();

    const waiting = await documents.waitingDocumentOfSale("sale-1");

    expect(waiting?.saleEvent).toMatchObject({ event_type: "sale_completed" });
  });

  it("carries no event when the outbox no longer holds the sale's", async () => {
    database.prepare("DELETE FROM outbox").run();

    const waiting = await documents.waitingDocumentOfSale("sale-1");

    expect(waiting).toMatchObject({ fiscalDocumentId: "doc-1", saleEvent: null });
  });

  it.each(["UNKNOWN", "AUTHORIZED", "REJECTED"] as const)(
    "is none once the document is %s",
    async (state) => {
      database.prepare("DELETE FROM fiscal_documents").run();
      insertFiscalDocument(database, { state });

      await expect(documents.waitingDocumentOfSale("sale-1")).resolves.toBeNull();
    },
  );

  it("is none for a sale the register reserved no document for", async () => {
    insertCompletedSale(database, "sale-2");

    await expect(documents.waitingDocumentOfSale("sale-2")).resolves.toBeNull();
  });
});

describe("resolving a waiting document", () => {
  it("authorizes it with its code and expiry, consuming the number, and routes nothing", async () => {
    await documents.resolve(
      resolution({
        resolution: {
          state: "AUTHORIZED",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-10",
        },
      }),
    );

    expect(storedDocument()).toEqual({
      state: "AUTHORIZED",
      authorization_code: "75123456789012",
      authorization_code_due_on: "2026-10-10",
      resolved_at: RESOLVED_AT.toISOString(),
    });
    expect(routings()).toEqual([]);
  });

  it("rejects it, releases the number for the next document and routes the sale to the deferred flow", async () => {
    await documents.resolve(
      resolution({ resolution: { state: "REJECTED", deferralReason: "rejected" } }),
    );

    expect(storedDocument()).toMatchObject({
      state: "REJECTED",
      authorization_code: null,
      resolved_at: RESOLVED_AT.toISOString(),
    });
    expect(routings()).toEqual([
      { sale_id: "sale-1", reason: "rejected", routed_at: RESOLVED_AT.toISOString() },
    ]);
    insertCompletedSale(database, "sale-2");
    insertFiscalDocument(database, { id: "doc-2", saleId: "sale-2", number: 41 });
  });

  it("leaves it unclear, keeping the number and the point of sale blocked, and routes the sale", async () => {
    await documents.resolve(
      resolution({ resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" } }),
    );

    expect(storedDocument()).toMatchObject({ state: "UNKNOWN", authorization_code: null });
    expect(routings()).toEqual([
      { sale_id: "sale-1", reason: "unclear_outcome", routed_at: RESOLVED_AT.toISOString() },
    ]);
    insertCompletedSale(database, "sale-2");
    expect(() =>
      insertFiscalDocument(database, { id: "doc-2", saleId: "sale-2", number: 42 }),
    ).toThrow(/UNIQUE/);
  });

  it("changes nothing when routing the sale fails", async () => {
    database
      .prepare(
        "INSERT INTO deferred_sales (sale_id, reason, routed_at) VALUES ('sale-1', 'rejected', '2026-09-30T12:05:00.000Z')",
      )
      .run();

    await expect(
      documents.resolve(
        resolution({ resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" } }),
      ),
    ).rejects.toThrow(/UNIQUE/);

    expect(storedDocument()).toMatchObject({ state: "REQUESTING", resolved_at: null });
  });

  it("refuses to resolve a document that is no longer waiting, leaving it as it is", async () => {
    await documents.resolve(
      resolution({ resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" } }),
    );

    await expect(
      documents.resolve(
        resolution({
          resolution: {
            state: "AUTHORIZED",
            authorizationCode: "75123456789012",
            authorizationCodeDueOn: "2026-10-10",
          },
        }),
      ),
    ).rejects.toThrow("the fiscal document is not waiting for an answer");
    expect(storedDocument()).toMatchObject({ state: "UNKNOWN" });
  });
});
