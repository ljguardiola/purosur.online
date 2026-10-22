import type {
  RealTimeAuthorizationCall,
  RealTimeTaxAuthority,
} from "@purosur/domain/fiscal/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { CHAIN_KEY } from "../sync/test-support/sqlite-local-outbox";
import { authorizeSaleInRealTime } from "./real-time-sale-authorization";
import {
  FACTURA_C,
  insertCompletedSale,
  insertFiscalDocument,
  insertHealthCheck,
  insertSaleCompletedEvent,
  openFiscalDatabase,
  POINT_OF_SALE,
  SALE_COMPLETED_AT,
} from "./test-support/real-time-authorization-database";
import { scriptedShortCodes } from "./test-support/scripted-short-codes";

const ANSWERED_AT = new Date("2026-09-30T12:05:02.000Z");

let database: LocalDatabase;
let calls: RealTimeAuthorizationCall[];

function taxAuthorityAnswering(
  answer: Awaited<ReturnType<RealTimeTaxAuthority["authorize"]>>,
): RealTimeTaxAuthority {
  return {
    authorize: async (call) => {
      calls.push(call);
      return answer;
    },
  };
}

function authorize(
  answer: Awaited<ReturnType<RealTimeTaxAuthority["authorize"]>>,
  saleId = "sale-1",
) {
  return authorizeSaleInRealTime(
    {
      database,
      taxAuthority: taxAuthorityAnswering(answer),
      now: () => ANSWERED_AT,
      ids: { next: () => "deferred-1" },
      shortCodes: scriptedShortCodes(["7KQ4M2P9", "R3XW8H5N"]),
      readOutboxChainKey: async () => CHAIN_KEY,
    },
    saleId,
  );
}

function storedDocument() {
  return database
    .prepare(
      "SELECT state, authorization_code, resolved_at FROM fiscal_documents WHERE id = 'doc-1'",
    )
    .get();
}

beforeEach(() => {
  database = openFiscalDatabase();
  calls = [];
  insertCompletedSale(database, "sale-1");
  insertSaleCompletedEvent(database, "sale-1");
  insertFiscalDocument(database);
  insertHealthCheck(database, { checkedAt: "2026-09-30T12:04:50.000Z", roundTripMs: 300 });
  insertHealthCheck(database, { checkedAt: "2026-09-30T12:04:55.000Z", roundTripMs: 100 });
  insertHealthCheck(database, { checkedAt: "2026-09-30T12:05:00.000Z", roundTripMs: 200 });
});

afterEach(() => {
  database.close();
});

describe("authorizing a completed sale in real time", () => {
  it("asks the tax authority for the sale's waiting document within the 5 second budget and the median round trip", async () => {
    await authorize({ kind: "unclear" });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      fiscalDocumentId: "doc-1",
      saleId: "sale-1",
      pointOfSale: POINT_OF_SALE,
      number: 41,
      issuedOn: "2026-09-30",
      document: FACTURA_C,
      saleEvent: { event_type: "sale_completed", aggregate_id: "sale-1" },
      timeoutMs: 5_000,
      roundTripMedianMs: 200,
    });
  });

  it("authorizes the document when the tax authority does, consuming its number", async () => {
    await authorize({
      kind: "authorized",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-10",
    });

    expect(storedDocument()).toEqual({
      state: "AUTHORIZED",
      authorization_code: "75123456789012",
      resolved_at: ANSWERED_AT.toISOString(),
    });
    expect(database.prepare("SELECT count(*) AS total FROM deferred_sales").get()).toEqual({
      total: 0,
    });
  });

  it("rejects the document and routes the sale to the deferred flow", async () => {
    await authorize({ kind: "rejected", codes: [10015], rejectionClass: "content" });

    expect(storedDocument()).toMatchObject({ state: "REJECTED" });
    expect(database.prepare("SELECT sale_id, reason FROM deferred_sales").all()).toEqual([
      { sale_id: "sale-1", reason: "rejected" },
    ]);
  });

  it("keeps the rejected sale's date and total in its deferred record, under the drawn identifier and short code", async () => {
    await authorize({ kind: "rejected", codes: [10015], rejectionClass: "content" });

    expect(
      database
        .prepare(
          "SELECT id, sale_id, occurred_at, total, reason, short_code, routed_at FROM deferred_sales",
        )
        .all(),
    ).toEqual([
      {
        id: "deferred-1",
        sale_id: "sale-1",
        occurred_at: SALE_COMPLETED_AT.toISOString(),
        total: FACTURA_C.total,
        reason: "rejected",
        short_code: "7KQ4M2P9",
        routed_at: ANSWERED_AT.toISOString(),
      },
    ]);
  });

  it("appends the event that carries the deferred record, with its short code, to the outbox", async () => {
    await authorize({ kind: "rejected", codes: [10015], rejectionClass: "content" });

    expect(
      database
        .prepare<[], { event_id: string; aggregate_id: string; payload: string }>(
          "SELECT event_id, aggregate_id, payload FROM outbox WHERE event_type = 'deferred_sale_recorded'",
        )
        .all()
        .map(({ payload, ...event }) => ({ ...event, payload: JSON.parse(payload) })),
    ).toEqual([
      {
        event_id: "deferred-1",
        aggregate_id: "sale-1",
        payload: {
          id: "deferred-1",
          sale_id: "sale-1",
          register_id: "register-1",
          occurred_at: SALE_COMPLETED_AT.toISOString(),
          total: FACTURA_C.total,
          reason: "rejected",
          short_code: "7KQ4M2P9",
          routed_at: ANSWERED_AT.toISOString(),
        },
      },
    ]);
  });

  it.each(["content", "standing"] as const)(
    "never asks again for a document rejected over its %s, whose sale stays deferred",
    async (rejectionClass) => {
      await authorize({ kind: "rejected", codes: [10015], rejectionClass });
      calls = [];

      await expect(
        authorize({
          kind: "authorized",
          authorizationCode: "1",
          authorizationCodeDueOn: "2026-10-10",
        }),
      ).resolves.toEqual({ kind: "not_waiting" });

      expect(calls).toEqual([]);
      expect(storedDocument()).toMatchObject({ state: "REJECTED", authorization_code: null });
      expect(database.prepare("SELECT sale_id, reason FROM deferred_sales").all()).toEqual([
        { sale_id: "sale-1", reason: "rejected" },
      ]);
    },
  );

  it.each([
    ["unclear", { kind: "unclear" }],
    ["not attempted", { kind: "not_attempted" }],
  ] as const)(
    "leaves the document unclear and routes the sale when the answer is %s",
    async (_case, answer) => {
      await authorize(answer);

      expect(storedDocument()).toMatchObject({ state: "UNKNOWN" });
      expect(database.prepare("SELECT sale_id, reason FROM deferred_sales").all()).toEqual([
        { sale_id: "sale-1", reason: "unclear_outcome" },
      ]);
    },
  );

  it("makes no call and leaves the document unclear when the sale's event is no longer held", async () => {
    database.prepare("DELETE FROM outbox").run();

    await authorize({ kind: "unclear" });

    expect(calls).toEqual([]);
    expect(storedDocument()).toMatchObject({ state: "UNKNOWN" });
  });

  it("asks nothing for a sale routed to the deferred flow, which has no document", async () => {
    insertCompletedSale(database, "sale-2");

    await expect(authorize({ kind: "unclear" }, "sale-2")).resolves.toEqual({
      kind: "not_waiting",
    });
    expect(calls).toEqual([]);
  });

  it("asks nothing for a document that already has its answer", async () => {
    await authorize({ kind: "unclear" });
    calls = [];

    await authorize({ kind: "unclear" });

    expect(calls).toEqual([]);
  });
});
