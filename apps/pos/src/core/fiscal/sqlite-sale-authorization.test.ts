import type { RoleAccess } from "@purosur/domain";
import {
  type CorrectRegisterClockGrant,
  correctRegisterClock,
} from "@purosur/domain/fiscal/use-cases";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { CHAIN_KEY } from "../sync/test-support/sqlite-local-outbox";
import { applyReplenishedOfflineFiscalDocument } from "./replenished-offline-fiscal-documents";
import { SqliteClockCorrectionLedger } from "./sqlite-clock-correction";
import { decideSaleAuthorizationIn } from "./sqlite-sale-authorization";
import {
  FACTURA_C,
  insertCompletedSale,
  insertDeferredSale,
  insertFiscalDocument,
  insertHealthCheck,
  insertOfflineAuthorizationCode,
  insertOfflineFiscalDocument,
  insertOfflineNumberBlock,
  insertOfflinePointOfSale,
  insertPointOfSale,
  insertSaleCompletedEvent,
  OFFLINE_CODE,
  OFFLINE_POINT_OF_SALE,
  openFiscalDatabase,
  POINT_OF_SALE,
  SALE_COMPLETED_AT,
} from "./test-support/real-time-authorization-database";
import { scriptedShortCodes } from "./test-support/scripted-short-codes";

const DECIDED_AT = new Date("2026-09-30T12:05:00.000Z");
const PASSED = { kind: "passed", document: FACTURA_C } as const;

let database: LocalDatabase;

function decide(
  gate: Parameters<typeof decideSaleAuthorizationIn>[1]["gate"] = PASSED,
  saleId = "sale-1",
  shortCodes = scriptedShortCodes(["7KQ4M2P9", "R3XW8H5N"]),
) {
  let issued = 0;
  decideSaleAuthorizationIn(
    database,
    {
      saleId,
      gate,
      decidedAt: DECIDED_AT,
      occurredAt: SALE_COMPLETED_AT,
      total: 12_500,
      ids: {
        next: () => {
          issued += 1;
          return issued === 1 ? "doc-new" : `id-${issued}`;
        },
      },
    },
    (event) => appendOutboxEvent(database, CHAIN_KEY, event),
    shortCodes,
  );
}

function documents() {
  return database
    .prepare(
      `SELECT id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
              authorization_code, authorization_code_due_on, reserved_at, resolved_at
       FROM fiscal_documents ORDER BY number`,
    )
    .all();
}

function routings() {
  return database.prepare("SELECT sale_id, reason, routed_at FROM deferred_sales").all();
}

beforeEach(() => {
  database = openFiscalDatabase();
  insertCompletedSale(database, "sale-1");
});

afterEach(() => {
  database.close();
});

describe("deciding how a completed sale is authorized, in the local database", () => {
  describe("when the register is online and the tax authority's count is known", () => {
    beforeEach(() => {
      insertHealthCheck(database);
      insertPointOfSale(database, 40);
    });

    it("reserves the number after the tax authority's last one, waiting on a response, and routes nothing", () => {
      decide();

      expect(documents()).toEqual([
        {
          id: "doc-new",
          sale_id: "sale-1",
          point_of_sale: POINT_OF_SALE,
          document_type: "factura_c",
          number: 41,
          issued_on: "2026-09-30",
          document: JSON.stringify(FACTURA_C),
          state: "REQUESTING",
          authorization_code: null,
          authorization_code_due_on: null,
          reserved_at: DECIDED_AT.toISOString(),
          resolved_at: null,
        },
      ]);
      expect(routings()).toEqual([]);
    });

    it("follows the register's own last authorized number when it is further along", () => {
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, {
        id: "doc-0",
        saleId: "sale-0",
        number: 45,
        state: "AUTHORIZED",
      });

      decide();

      expect(documents().map((row) => (row as { number: number }).number)).toEqual([45, 46]);
    });

    it("reserves again the number of a released document", () => {
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, {
        id: "doc-0",
        saleId: "sale-0",
        number: 41,
        state: "RELEASED",
      });

      decide();

      expect(
        documents().map((row) => ({
          id: (row as { id: string }).id,
          number: (row as { number: number }).number,
        })),
      ).toEqual([
        { id: "doc-0", number: 41 },
        { id: "doc-new", number: 41 },
      ]);
    });

    it("never reserves again the number of a conflicting document", () => {
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, {
        id: "doc-0",
        saleId: "sale-0",
        number: 41,
        state: "CONFLICTING",
      });

      decide();

      expect(documents().map((row) => (row as { number: number }).number)).toEqual([41, 42]);
    });

    it("leaves a rejected number out of the register's own count", () => {
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, {
        id: "doc-0",
        saleId: "sale-0",
        number: 50,
        state: "REJECTED",
      });

      decide();

      expect(documents().map((row) => (row as { number: number }).number)).toEqual([41, 50]);
    });

    it.each(["REQUESTING", "UNKNOWN"] as const)(
      "routes the sale to the deferred flow while a document is %s at the point of sale",
      (state) => {
        insertCompletedSale(database, "sale-0");
        insertFiscalDocument(database, { id: "doc-0", saleId: "sale-0", number: 41, state });

        decide();

        expect(documents()).toHaveLength(1);
        expect(routings()).toEqual([
          { sale_id: "sale-1", reason: "document_waiting", routed_at: DECIDED_AT.toISOString() },
        ]);
      },
    );

    it("reserves after a document of another point of sale is waiting", () => {
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, { id: "doc-0", saleId: "sale-0", pointOfSale: 13, number: 7 });

      decide();

      expect(documents()).toHaveLength(2);
      expect(routings()).toEqual([]);
    });

    it("records the deferred sale whole: its identifier, the sale's date and total, the reason, a short code and when it was routed", () => {
      decide({ kind: "failed", reason: "issuer_identification_missing" });

      expect(
        database
          .prepare(
            `SELECT id, sale_id, occurred_at, total, reason, short_code, routed_at,
                    satisfied_by_fiscal_document_id, satisfied_at
             FROM deferred_sales`,
          )
          .all(),
      ).toEqual([
        {
          id: "doc-new",
          sale_id: "sale-1",
          occurred_at: SALE_COMPLETED_AT.toISOString(),
          total: 12_500,
          reason: "pre_emission_gate_failed",
          short_code: "7KQ4M2P9",
          routed_at: DECIDED_AT.toISOString(),
          satisfied_by_fiscal_document_id: null,
          satisfied_at: null,
        },
      ]);
    });

    it("draws another short code when another sale's record already holds the first", () => {
      insertCompletedSale(database, "sale-0");
      insertDeferredSale(database, "sale-0");
      database.prepare("UPDATE deferred_sales SET short_code = '7KQ4M2P9'").run();

      decide({ kind: "failed", reason: "issuer_identification_missing" });

      expect(
        database.prepare("SELECT short_code FROM deferred_sales WHERE sale_id = 'sale-1'").all(),
      ).toEqual([{ short_code: "R3XW8H5N" }]);
    });

    it("routes the sale with the gate's reason and reserves nothing when the gate failed", () => {
      decide({ kind: "failed", reason: "issuer_identification_missing" });

      expect(documents()).toEqual([]);
      expect(routings()).toEqual([
        {
          sale_id: "sale-1",
          reason: "pre_emission_gate_failed",
          routed_at: DECIDED_AT.toISOString(),
        },
      ]);
    });
  });

  it("routes the sale as fiscally offline when no health check was ever recorded", () => {
    insertPointOfSale(database, 40);

    decide();

    expect(documents()).toEqual([]);
    expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "fiscally_offline" }]);
  });

  it("goes by the latest health check only", () => {
    insertPointOfSale(database, 40);
    insertHealthCheck(database, { checkedAt: "2026-09-30T12:04:50.000Z" });
    insertHealthCheck(database, { checkedAt: "2026-09-30T12:04:55.000Z", tokenValid: false });

    decide();

    expect(routings()).toMatchObject([{ reason: "fiscally_offline" }]);
  });

  it.each([
    ["is too old", { checkedAt: "2026-09-30T12:04:00.000Z" }],
    ["found the token invalid", { tokenValid: false }],
    ["found the tax authority unreachable", { arcaReachable: false }],
  ])("routes the sale as fiscally offline when the latest health check %s", (_case, check) => {
    insertPointOfSale(database, 40);
    insertHealthCheck(database, check);

    decide();

    expect(documents()).toEqual([]);
    expect(routings()).toMatchObject([{ reason: "fiscally_offline" }]);
  });

  it("routes the sale when the register has no point of sale yet", () => {
    insertHealthCheck(database);

    decide();

    expect(routings()).toMatchObject([{ reason: "point_of_sale_missing" }]);
  });

  it("routes the sale until the tax authority's count reaches the register", () => {
    insertHealthCheck(database);
    insertPointOfSale(database, null);

    decide();

    expect(documents()).toEqual([]);
    expect(routings()).toMatchObject([{ reason: "tax_authority_count_unknown" }]);
  });

  it("reserves nothing for a removed register's point of sale", () => {
    insertHealthCheck(database);
    insertPointOfSale(database, 40);
    database.prepare("UPDATE own_register SET removed = 1").run();

    decide();

    expect(routings()).toMatchObject([{ reason: "point_of_sale_missing" }]);
  });

  it("gives a sale at most one document: deciding it again once its document resolved is refused", () => {
    insertHealthCheck(database);
    insertPointOfSale(database, 40);
    decide();
    database
      .prepare(
        `UPDATE fiscal_documents SET state = 'AUTHORIZED', authorization_code = 'c',
           authorization_code_due_on = '2026-10-10', resolved_at = '2026-09-30T12:05:01.000Z'`,
      )
      .run();

    expect(() => decide()).toThrow(/UNIQUE/);
    expect(documents()).toHaveLength(1);
  });
});

function offlineDocuments() {
  return database
    .prepare(
      `SELECT id, sale_id, point_of_sale, document_type, number, issued_on, generated_at,
              generation_stamp, offline_authorization_code, fortnight_start, fortnight_end,
              document, buyer_document_type, buyer_document_number, cause
       FROM offline_fiscal_documents ORDER BY number`,
    )
    .all();
}

function alreadyIssued(pointOfSale: number, ...numbers: number[]): void {
  for (const number of numbers) {
    const saleId = `earlier-sale-${pointOfSale}-${number}`;
    insertCompletedSale(database, saleId);
    insertOfflineFiscalDocument(database, {
      id: `earlier-doc-${pointOfSale}-${number}`,
      saleId,
      pointOfSale,
      number,
    });
  }
}

function outboxEvents() {
  return database
    .prepare(
      "SELECT device_seq, aggregate_id, event_type, actor_id, payload FROM outbox ORDER BY device_seq",
    )
    .all() as {
    device_seq: number;
    aggregate_id: string;
    event_type: string;
    actor_id: string;
    payload: string;
  }[];
}

describe("deciding a sale's authorization when the register holds a code for its fortnight", () => {
  beforeEach(() => {
    insertSaleCompletedEvent(database, "sale-1");
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
    insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
    insertOfflineAuthorizationCode(database);
  });

  describe("while the register is not online for fiscal purposes", () => {
    it("issues the document whole under the code of the sale's fortnight, with the block's first number", () => {
      decide();

      expect(offlineDocuments()).toEqual([
        {
          id: "doc-new",
          sale_id: "sale-1",
          point_of_sale: OFFLINE_POINT_OF_SALE,
          document_type: "factura_c",
          number: 1,
          issued_on: "2026-09-30",
          generated_at: DECIDED_AT.toISOString(),
          generation_stamp: "20260930090500",
          offline_authorization_code: OFFLINE_CODE,
          fortnight_start: "2026-09-16",
          fortnight_end: "2026-09-30",
          document: JSON.stringify(FACTURA_C),
          buyer_document_type: 99,
          buyer_document_number: 0,
          cause: "no_connectivity",
        },
      ]);
      expect(documents()).toEqual([]);
      expect(routings()).toEqual([]);
    });

    it("appends the document's event right after the sale's, in the same chain, with the register and person of the sale", () => {
      decide();

      const [completed, issued] = outboxEvents();
      expect(completed?.event_type).toBe("sale_completed");
      expect(issued).toMatchObject({
        device_seq: 2,
        aggregate_id: "sale-1",
        event_type: "offline_fiscal_document_issued",
        actor_id: "u1",
      });
      expect(JSON.parse(issued?.payload ?? "")).toMatchObject({
        fiscal_document_id: "doc-new",
        sale_id: "sale-1",
        register_id: "register-1",
        point_of_sale: OFFLINE_POINT_OF_SALE,
        number: 1,
        offline_authorization_code: OFFLINE_CODE,
        fortnight_start: "2026-09-16",
        fortnight_end: "2026-09-30",
        total: 12_500,
        cause: "no_connectivity",
      });
      expect(outboxEvents()).toHaveLength(2);
    });

    it("takes the number after the one a replenished document holds, never repeating it", () => {
      insertCompletedSale(database, "replenished-sale");
      applyReplenishedOfflineFiscalDocument(database, {
        kind: "offline_fiscal_document_issued",
        document: {
          fiscalDocumentId: "replenished-doc",
          saleId: "replenished-sale",
          registerId: "register-1",
          pointOfSale: OFFLINE_POINT_OF_SALE,
          documentType: "factura_c",
          number: 5,
          issuedOn: "2026-09-30",
          generatedAt: DECIDED_AT,
          generationStamp: "20260930090500",
          offlineAuthorizationCode: OFFLINE_CODE,
          fortnightStart: "2026-09-16",
          fortnightEnd: "2026-09-30",
          buyerDocumentType: 99,
          buyerDocumentNumber: 0,
          buyerTaxStatusCode: 5,
          total: 12_500,
          netAmount: 12_500,
          cause: "no_connectivity",
          invoice: FACTURA_C,
        },
      });

      decide();

      expect(offlineDocuments().map((row) => (row as { number: number }).number)).toEqual([5, 6]);
    });

    it("takes the lowest unused number of the block after the documents already issued", () => {
      alreadyIssued(OFFLINE_POINT_OF_SALE, 1, 2);

      decide();

      expect(offlineDocuments().map((row) => (row as { number: number }).number)).toEqual([
        1, 2, 3,
      ]);
    });

    it("continues after the tax authority's last authorized number when it is above the documents issued", () => {
      database
        .prepare(
          "UPDATE register_offline_point_of_sale SET tax_authority_last_authorized_number = 40",
        )
        .run();
      database
        .prepare("UPDATE offline_number_blocks SET first_number = 41, last_number = 1040")
        .run();

      decide();

      expect(offlineDocuments().map((row) => (row as { number: number }).number)).toEqual([41]);
    });

    it("moves to the next block once the first is used up", () => {
      insertOfflineNumberBlock(database, "block-2", 1001, 2000, OFFLINE_POINT_OF_SALE);
      alreadyIssued(OFFLINE_POINT_OF_SALE, 1000);

      decide();

      expect(offlineDocuments().map((row) => (row as { number: number }).number)).toEqual([
        1000, 1001,
      ]);
    });

    it("takes the first number of the earliest block when a later block was stored before it", () => {
      database.prepare("DELETE FROM offline_number_blocks").run();
      insertOfflineNumberBlock(database, "block-2", 1001, 2000, OFFLINE_POINT_OF_SALE);
      insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);

      decide();

      expect(offlineDocuments().map((row) => (row as { number: number }).number)).toEqual([1]);
    });

    it("ignores the documents and blocks of another offline point of sale", () => {
      insertOfflineNumberBlock(database, "other", 5001, 6000, POINT_OF_SALE);
      alreadyIssued(POINT_OF_SALE, 5001);

      decide();

      expect(offlineDocuments().map((row) => (row as { number: number }).number)).toEqual([
        1, 5001,
      ]);
    });

    it("gives the same document whatever the register's clock says", () => {
      try {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2031-03-20T00:00:00.000Z"));
        decide();
      } finally {
        vi.useRealTimers();
      }

      expect(offlineDocuments()).toMatchObject([{ number: 1, fortnight_start: "2026-09-16" }]);
    });

    it("defers the sale as fiscally offline, issuing and appending nothing, when no code covers the sale's date", () => {
      database.prepare("DELETE FROM offline_authorization_codes").run();
      insertOfflineAuthorizationCode(database, {
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
      });

      decide();

      expect(offlineDocuments()).toEqual([]);
      expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "fiscally_offline" }]);
      expect(outboxEvents()).toHaveLength(1);
    });

    it.each([
      ["every block is used up", () => alreadyIssued(OFFLINE_POINT_OF_SALE, 1000)],
      [
        "the register has no block",
        () => database.prepare("DELETE FROM offline_number_blocks").run(),
      ],
      [
        "the tax authority's last authorized number is unknown",
        () =>
          database
            .prepare(
              "UPDATE register_offline_point_of_sale SET tax_authority_last_authorized_number = NULL",
            )
            .run(),
      ],
      [
        "the register has no offline point of sale",
        () => database.prepare("DELETE FROM register_offline_point_of_sale").run(),
      ],
    ])("defers the sale as fiscally offline, taking no number, when %s", (_case, arrange) => {
      arrange();

      decide();

      expect(
        offlineDocuments().filter((row) => (row as { sale_id: string }).sale_id === "sale-1"),
      ).toEqual([]);
      expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "fiscally_offline" }]);
      expect(outboxEvents()).toHaveLength(1);
    });

    it("defers a sale whose gate failed, even holding a code", () => {
      decide({ kind: "failed", reason: "issuer_identification_missing" });

      expect(offlineDocuments()).toEqual([]);
      expect(routings()).toMatchObject([{ reason: "pre_emission_gate_failed" }]);
    });

    it("uses the code of the fortnight the sale's own date falls in, not the one of the moment it is decided", () => {
      database.prepare("DELETE FROM offline_authorization_codes").run();
      insertOfflineAuthorizationCode(database, {
        code: "11111111111111",
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
      });
      insertOfflineAuthorizationCode(database, { code: "22222222222222" });

      decideSaleAuthorizationIn(
        database,
        {
          saleId: "sale-1",
          gate: PASSED,
          decidedAt: new Date("2026-10-01T03:00:30.000Z"),
          occurredAt: new Date("2026-10-01T02:59:59.000Z"),
          total: 12_500,
          ids: { next: () => "doc-new" },
        },
        (event) => appendOutboxEvent(database, CHAIN_KEY, event),
      );

      expect(offlineDocuments()).toMatchObject([
        {
          offline_authorization_code: "22222222222222",
          issued_on: "2026-09-30",
          fortnight_start: "2026-09-16",
        },
      ]);
    });

    it("leaves nothing behind when the document's event cannot be appended", () => {
      database.exec(
        `CREATE TRIGGER refuse_events BEFORE INSERT ON outbox
         WHEN NEW.event_type = 'offline_fiscal_document_issued'
         BEGIN SELECT RAISE(ABORT, 'refused'); END`,
      );

      expect(() => database.transaction(() => decide())()).toThrow("refused");

      expect(offlineDocuments()).toEqual([]);
    });
  });

  describe("while the register is online and the real-time series holds an unclear document", () => {
    beforeEach(() => {
      insertHealthCheck(database);
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, {
        id: "doc-0",
        saleId: "sale-0",
        number: 41,
        state: "UNKNOWN",
      });
    });

    it("issues the document under the code, recorded as an unclear outcome and not as a connectivity problem", () => {
      decide();

      expect(offlineDocuments()).toMatchObject([
        { sale_id: "sale-1", number: 1, cause: "unclear_outcome" },
      ]);
      expect(documents()).toHaveLength(1);
      expect(routings()).toEqual([]);
    });

    it("defers the sale for the waiting document when no code covers its date", () => {
      database.prepare("DELETE FROM offline_authorization_codes").run();

      decide();

      expect(offlineDocuments()).toEqual([]);
      expect(routings()).toMatchObject([{ reason: "document_waiting" }]);
    });
  });

  describe("while the register is online and the real-time series holds a document still requested", () => {
    it("defers the sale for the waiting document, holding a code", () => {
      insertHealthCheck(database);
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, {
        id: "doc-0",
        saleId: "sale-0",
        number: 41,
        state: "REQUESTING",
      });

      decide();

      expect(offlineDocuments()).toEqual([]);
      expect(routings()).toMatchObject([{ reason: "document_waiting" }]);
    });
  });
});

describe("deciding a sale's authorization when the point of sale's numbering is frozen", () => {
  beforeEach(() => {
    insertSaleCompletedEvent(database, "sale-1");
    insertHealthCheck(database);
    insertPointOfSale(database, 40, POINT_OF_SALE, true);
  });

  describe("holding a code and a block", () => {
    beforeEach(() => {
      insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
      insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
      insertOfflineAuthorizationCode(database);
    });

    it("issues the document under the code as a numbering conflict, although the register is online and the count is known", () => {
      decide();

      expect(offlineDocuments()).toMatchObject([
        { sale_id: "sale-1", number: 1, cause: "numbering_conflict" },
      ]);
      expect(documents()).toEqual([]);
      expect(routings()).toEqual([]);
    });

    it("goes back to the real-time series once the numbering is no longer frozen", () => {
      database.prepare("UPDATE register_point_of_sale SET numbering_frozen = 0").run();

      decide();

      expect(offlineDocuments()).toEqual([]);
      expect(documents()).toMatchObject([{ sale_id: "sale-1", number: 41, state: "REQUESTING" }]);
    });
  });

  it("defers the sale for the frozen numbering when no code is held", () => {
    decide();

    expect(offlineDocuments()).toEqual([]);
    expect(documents()).toEqual([]);
    expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "numbering_frozen" }]);
  });
});

describe("deciding a sale's authorization against the register's clock marks", () => {
  function setClockMark(pointOfSale: number, reading: string) {
    database
      .prepare(
        `INSERT INTO register_clock_marks (point_of_sale, document_type, reading)
         VALUES (?, 'factura_c', ?)`,
      )
      .run(pointOfSale, reading);
  }

  function clockMarks() {
    return database
      .prepare(
        "SELECT point_of_sale, document_type, reading FROM register_clock_marks ORDER BY point_of_sale",
      )
      .all();
  }

  beforeEach(() => {
    insertSaleCompletedEvent(database, "sale-1");
    insertHealthCheck(database);
    insertPointOfSale(database, 40);
  });

  describe("on the real-time series", () => {
    it("reserves the number and raises the mark to the instant of the decision when the register holds none", () => {
      decide();

      expect(documents()).toMatchObject([{ number: 41, state: "REQUESTING" }]);
      expect(clockMarks()).toEqual([
        {
          point_of_sale: POINT_OF_SALE,
          document_type: "factura_c",
          reading: DECIDED_AT.toISOString(),
        },
      ]);
    });

    it("raises a mark that is behind the decision", () => {
      setClockMark(POINT_OF_SALE, "2026-09-30T11:00:00.000Z");

      decide();

      expect(clockMarks()).toEqual([
        {
          point_of_sale: POINT_OF_SALE,
          document_type: "factura_c",
          reading: DECIDED_AT.toISOString(),
        },
      ]);
    });

    it("keeps a mark ahead of the decision within the tolerance, reserving the number", () => {
      setClockMark(POINT_OF_SALE, "2026-09-30T12:05:30.000Z");

      decide();

      expect(documents()).toMatchObject([{ number: 41 }]);
      expect(clockMarks()).toEqual([
        {
          point_of_sale: POINT_OF_SALE,
          document_type: "factura_c",
          reading: "2026-09-30T12:05:30.000Z",
        },
      ]);
    });

    it("reserves nothing and defers the sale as clock_behind when the clock reads more than a minute behind the mark", () => {
      setClockMark(POINT_OF_SALE, "2026-09-30T12:07:00.000Z");

      decide();

      expect(documents()).toEqual([]);
      expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "clock_behind" }]);
      expect(clockMarks()).toEqual([
        {
          point_of_sale: POINT_OF_SALE,
          document_type: "factura_c",
          reading: "2026-09-30T12:07:00.000Z",
        },
      ]);
    });

    it("ignores the mark of another point of sale", () => {
      setClockMark(OFFLINE_POINT_OF_SALE, "2026-09-30T13:00:00.000Z");

      decide();

      expect(documents()).toMatchObject([{ number: 41 }]);
    });

    it("defers the sale as clock_behind when the clock reads a day before the tax authority's last authorized day", () => {
      database
        .prepare(
          "UPDATE register_point_of_sale SET tax_authority_last_authorized_issued_on = '2026-10-01'",
        )
        .run();

      decide();

      expect(documents()).toEqual([]);
      expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "clock_behind" }]);
    });

    it("reserves the number when the clock reads the tax authority's last authorized day", () => {
      database
        .prepare(
          "UPDATE register_point_of_sale SET tax_authority_last_authorized_issued_on = '2026-09-30'",
        )
        .run();

      decide();

      expect(documents()).toMatchObject([{ number: 41 }]);
    });
  });

  describe("in the lapse after a clock correction", () => {
    beforeEach(() => {
      database
        .prepare(
          "UPDATE register_point_of_sale SET tax_authority_last_authorized_issued_on = '2026-10-02'",
        )
        .run();
      database
        .prepare(
          `INSERT INTO clock_corrections (
             period, register_id, actor_id, point_of_sale, document_type, previous_reading, corrected_reading
           ) VALUES ('s1', 'r1', 'u1', ?, 'factura_c', '2026-10-03T15:00:00.000Z', '2026-09-30T10:00:00.000Z')`,
        )
        .run(POINT_OF_SALE);
    });

    it("issues the sale under the code of its fortnight with the lapse as its cause, while the register is online", () => {
      insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
      insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
      insertOfflineAuthorizationCode(database);

      decide();

      expect(documents()).toEqual([]);
      expect(routings()).toEqual([]);
      expect(offlineDocuments()).toMatchObject([
        {
          sale_id: "sale-1",
          point_of_sale: OFFLINE_POINT_OF_SALE,
          number: 1,
          issued_on: "2026-09-30",
          offline_authorization_code: OFFLINE_CODE,
          cause: "clock_correction_lapse",
        },
      ]);
    });

    it("defers the sale as clock_behind when the register holds no code for it", () => {
      decide();

      expect(offlineDocuments()).toEqual([]);
      expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "clock_behind" }]);
    });
  });

  describe("on a restored register that holds no clock mark, with the clock before the tax authority's last authorized day", () => {
    const CORRECTOR: RoleAccess = {
      isAdministrator: false,
      permissionKeys: ["correct_register_clock"],
    };
    const people = { activePerson: () => ({ firstName: "Ada", access: CORRECTOR }) };

    beforeEach(() => {
      database
        .prepare(
          "UPDATE register_point_of_sale SET tax_authority_last_authorized_issued_on = '2026-10-02'",
        )
        .run();
      insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
      insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
      insertOfflineAuthorizationCode(database);
    });

    function correctClock() {
      let issued = 0;
      return correctRegisterClock<CorrectRegisterClockGrant, never>({
        ledger: new SqliteClockCorrectionLedger(database, people, CHAIN_KEY),
        clock: { now: () => new Date("2026-09-30T12:00:00.000Z") },
        ids: {
          next: () => {
            issued += 1;
            return `correction-${issued}`;
          },
        },
        authority: { authorize: async () => ({ kind: "granted", grant: { correctorId: "u1" } }) },
      });
    }

    it("issues the sale under the code of its fortnight with the confirmed date once the clock is corrected, and defers nothing", async () => {
      await expect(correctClock()).resolves.toMatchObject({ kind: "corrected" });

      decide();

      expect(documents()).toEqual([]);
      expect(routings()).toEqual([]);
      expect(offlineDocuments()).toMatchObject([
        {
          sale_id: "sale-1",
          point_of_sale: OFFLINE_POINT_OF_SALE,
          issued_on: "2026-09-30",
          offline_authorization_code: OFFLINE_CODE,
          cause: "clock_correction_lapse",
        },
      ]);
    });

    it("keeps no mark of the series the correction lowered from the tax authority's day", async () => {
      await correctClock();

      expect(clockMarks()).toEqual([]);
    });

    it("defers the sale as clock_behind while no correction was confirmed", () => {
      decide();

      expect(offlineDocuments()).toEqual([]);
      expect(documents()).toEqual([]);
      expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "clock_behind" }]);
    });
  });

  describe("in the lapse opened by a later correction that set the clock further back than an earlier one", () => {
    beforeEach(() => {
      database
        .prepare(
          "UPDATE register_point_of_sale SET tax_authority_last_authorized_issued_on = '2026-10-02'",
        )
        .run();
      const correct = database.prepare(
        `INSERT INTO clock_corrections (
           period, register_id, actor_id, point_of_sale, document_type, previous_reading, corrected_reading
         ) VALUES (?, 'r1', 'u1', ?, 'factura_c', ?, ?)`,
      );
      correct.run("s1", POINT_OF_SALE, "2026-10-01T15:00:00.000Z", "2026-09-30T11:00:00.000Z");
      correct.run("s2", POINT_OF_SALE, "2026-10-02T15:00:00.000Z", "2026-09-30T10:00:00.000Z");
    });

    it("issues the sale under the code of its fortnight with the lapse as its cause, while the register is online", () => {
      insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
      insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
      insertOfflineAuthorizationCode(database);

      decide();

      expect(documents()).toEqual([]);
      expect(routings()).toEqual([]);
      expect(offlineDocuments()).toMatchObject([
        { sale_id: "sale-1", number: 1, cause: "clock_correction_lapse" },
      ]);
    });
  });

  describe("when the register holds a code and a block", () => {
    beforeEach(() => {
      insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
      insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
      insertOfflineAuthorizationCode(database);
      setClockMark(POINT_OF_SALE, "2026-09-30T12:07:00.000Z");
    });

    it("defers the sale as clock_behind, issuing nothing under the code and raising no mark", () => {
      decide();

      expect(documents()).toEqual([]);
      expect(offlineDocuments()).toEqual([]);
      expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "clock_behind" }]);
      expect(clockMarks()).toEqual([
        {
          point_of_sale: POINT_OF_SALE,
          document_type: "factura_c",
          reading: "2026-09-30T12:07:00.000Z",
        },
      ]);
    });

    it("defers the sale as clock_behind when the offline series' own mark is ahead of the sale by more than a minute", () => {
      setClockMark(OFFLINE_POINT_OF_SALE, "2026-09-30T12:09:00.000Z");

      decide();

      expect(offlineDocuments()).toEqual([]);
      expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "clock_behind" }]);
    });
  });

  it("never lowers the mark when the sale is deferred for another reason", () => {
    database.prepare("DELETE FROM register_point_of_sale").run();
    setClockMark(POINT_OF_SALE, "2026-09-30T12:07:00.000Z");

    decide();

    expect(routings()).toMatchObject([{ reason: "point_of_sale_missing" }]);
    expect(clockMarks()).toMatchObject([{ reading: "2026-09-30T12:07:00.000Z" }]);
  });
});
