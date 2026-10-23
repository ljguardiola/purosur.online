import type { RebuiltUnclearDeferral } from "@purosur/domain";
import { FICTIONAL_ISSUER } from "@purosur/domain/fiscal/test-support";
import {
  A_DEFERRED_SALE_RECORDED_FACT,
  aCompletedSaleFact,
  aDeferredSaleSatisfiedFact,
} from "@purosur/domain/sync/test-support";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { insertOpenedSession } from "../register/sqlite-cash-ledger";
import { applyReplenishedSaleFact } from "../sales/replenished-sale-facts";
import { applyReplenishedDeferredSaleSatisfaction } from "./replenished-deferred-sale-satisfactions";
import {
  applyReplenishedDeferredSale,
  holdsDeferredSaleRecord,
  rebuildReplenishedUnclearDeferredSale,
} from "./replenished-deferred-sales";

type DeferredSaleFact = Extract<SyncedFact, { kind: "deferred_sale_recorded" }>;

const RECORDED = A_DEFERRED_SALE_RECORDED_FACT as DeferredSaleFact;

let database: LocalDatabase;

function recordOf(saleId = RECORDED.deferredSale.saleId): DeferredSaleFact {
  return { ...RECORDED, deferredSale: { ...RECORDED.deferredSale, saleId } };
}

function records() {
  return database
    .prepare(
      `SELECT id, sale_id, occurred_at, total, reason, short_code, routed_at,
              satisfied_at, cancelled_at FROM deferred_sales`,
    )
    .all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('register-new', 'Caja 1', 1, 0);
     UPDATE sync_state SET device_id = 'device-new';`,
  );
  insertOpenedSession(database, {
    id: "session-1",
    registerId: "register-new",
    deviceId: "device-old",
    openedBy: "cashier-1",
    openedAt: new Date("2026-10-07T08:00:00.000Z"),
    openingFloat: 0,
    state: "OPEN",
  });
  applyReplenishedSaleFact(database, aCompletedSaleFact({ operationNumber: 1 }), {
    eventId: "event-1",
    deviceId: "device-old",
  });
});

afterEach(() => {
  database.close();
});

describe("replenishing a deferred-sale record into a restored register", () => {
  it("writes the record with the identifier and the short code it was issued with", () => {
    expect(applyReplenishedDeferredSale(database, RECORDED)).toBe("applied");

    expect(records()).toEqual([
      {
        id: "deferred-1",
        sale_id: "sale-1",
        occurred_at: "2026-10-07T10:00:00.000Z",
        total: 4800,
        reason: "pre_emission_gate_failed",
        short_code: "7KQ4M2P9",
        routed_at: "2026-10-07T10:00:01.000Z",
        satisfied_at: null,
        cancelled_at: null,
      },
    ]);
  });

  it("changes nothing when the register already holds a record for the sale, even one with another short code", () => {
    applyReplenishedDeferredSale(database, RECORDED);
    const held = records();

    const application = applyReplenishedDeferredSale(database, {
      ...RECORDED,
      deferredSale: { ...RECORDED.deferredSale, id: "deferred-2", shortCode: "R3XW8H5N" },
    });

    expect(application).toBe("applied");
    expect(records()).toEqual(held);
  });

  it("is not yet applicable while the register does not hold the sale", () => {
    expect(applyReplenishedDeferredSale(database, recordOf("sale-2"))).toBe("not_yet_applicable");

    expect(records()).toEqual([]);
  });

  it("holds the record of a sale only once it was written", () => {
    expect(holdsDeferredSaleRecord(database, "sale-1")).toBe(false);

    applyReplenishedDeferredSale(database, RECORDED);

    expect(holdsDeferredSaleRecord(database, "sale-1")).toBe(true);
    expect(holdsDeferredSaleRecord(database, "sale-2")).toBe(false);
  });

  it("never puts the replenished record in the outbox", () => {
    applyReplenishedDeferredSale(database, RECORDED);

    expect(database.prepare("SELECT count(*) AS total FROM outbox").get()).toEqual({ total: 0 });
  });
});

describe("rebuilding the deferred-sale record of an unclear outcome in a restored register", () => {
  const SATISFIED = aDeferredSaleSatisfiedFact(FICTIONAL_ISSUER);
  if (SATISFIED.kind !== "deferred_sale_satisfied") {
    throw new Error("not a satisfaction");
  }
  const { satisfaction } = SATISFIED;
  const UNCLEAR_RECORD = { ...RECORDED.deferredSale, reason: "unclear_outcome" } as const;
  const PENDING: RebuiltUnclearDeferral = {
    deferredSale: UNCLEAR_RECORD,
    authorizedDocument: null,
  };
  const AUTHORIZED: RebuiltUnclearDeferral = {
    deferredSale: UNCLEAR_RECORD,
    authorizedDocument: {
      id: satisfaction.fiscalDocumentId,
      saleId: "sale-1",
      pointOfSale: satisfaction.pointOfSale,
      number: satisfaction.number,
      issuedOn: satisfaction.issuedOn,
      document: satisfaction.document,
      authorizationCode: satisfaction.authorizationCode,
      authorizationCodeDueOn: satisfaction.authorizationCodeDueOn,
      reservedAt: satisfaction.reservedAt,
      satisfiedAt: satisfaction.satisfiedAt,
    },
  };

  function satisfactions() {
    return database
      .prepare(
        "SELECT sale_id, reason, short_code, satisfied_by_fiscal_document_id, satisfied_at FROM deferred_sales",
      )
      .all();
  }

  function documents() {
    return database
      .prepare(
        `SELECT id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
                authorization_code, authorization_code_due_on, reserved_at, resolved_at
         FROM fiscal_documents`,
      )
      .all();
  }

  it("writes a pending record, with the identifier and short code it was issued with, and no document", () => {
    expect(rebuildReplenishedUnclearDeferredSale(database, PENDING)).toBe("applied");

    expect(records()).toEqual([
      {
        id: "deferred-1",
        sale_id: "sale-1",
        occurred_at: "2026-10-07T10:00:00.000Z",
        total: 4800,
        reason: "unclear_outcome",
        short_code: "7KQ4M2P9",
        routed_at: "2026-10-07T10:00:01.000Z",
        satisfied_at: null,
        cancelled_at: null,
      },
    ]);
    expect(documents()).toEqual([]);
  });

  it("writes the record with the rejection as its reason when the tax authority rejected it", () => {
    rebuildReplenishedUnclearDeferredSale(database, {
      deferredSale: { ...UNCLEAR_RECORD, reason: "rejected" },
      authorizedDocument: null,
    });

    expect(satisfactions()).toEqual([
      {
        sale_id: "sale-1",
        reason: "rejected",
        short_code: "7KQ4M2P9",
        satisfied_by_fiscal_document_id: null,
        satisfied_at: null,
      },
    ]);
  });

  it("writes the authorized document with the cloud's number and code, and the record satisfied by it", () => {
    expect(rebuildReplenishedUnclearDeferredSale(database, AUTHORIZED)).toBe("applied");

    expect(documents()).toEqual([
      {
        id: "document-1",
        sale_id: "sale-1",
        point_of_sale: 7,
        document_type: "factura_c",
        number: 42,
        issued_on: "2026-10-07",
        document: JSON.stringify(satisfaction.document),
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-17",
        reserved_at: "2026-10-09T09:59:58.000Z",
        resolved_at: "2026-10-09T10:00:00.000Z",
      },
    ]);
    expect(satisfactions()).toEqual([
      {
        sale_id: "sale-1",
        reason: "unclear_outcome",
        short_code: "7KQ4M2P9",
        satisfied_by_fiscal_document_id: "document-1",
        satisfied_at: "2026-10-09T10:00:00.000Z",
      },
    ]);
  });

  it("changes nothing when the same answer is applied again", () => {
    rebuildReplenishedUnclearDeferredSale(database, AUTHORIZED);
    const heldRecords = records();
    const heldDocuments = documents();

    expect(rebuildReplenishedUnclearDeferredSale(database, AUTHORIZED)).toBe("applied");

    expect(records()).toEqual(heldRecords);
    expect(documents()).toEqual(heldDocuments);
  });

  it("changes nothing when the register already holds a record for the sale, even one with another short code", () => {
    rebuildReplenishedUnclearDeferredSale(database, PENDING);
    const heldRecords = records();

    const application = rebuildReplenishedUnclearDeferredSale(database, {
      ...AUTHORIZED,
      deferredSale: { ...UNCLEAR_RECORD, id: "deferred-2", shortCode: "R3XW8H5N" },
    });

    expect(application).toBe("applied");
    expect(records()).toEqual(heldRecords);
    expect(documents()).toEqual([]);
  });

  it("is not yet applicable while the register does not hold the sale, writing nothing", () => {
    const application = rebuildReplenishedUnclearDeferredSale(database, {
      ...AUTHORIZED,
      deferredSale: { ...UNCLEAR_RECORD, saleId: "sale-2" },
    });

    expect(application).toBe("not_yet_applicable");
    expect(records()).toEqual([]);
    expect(documents()).toEqual([]);
  });

  it("leaves the later satisfaction of the same document with no effect", () => {
    rebuildReplenishedUnclearDeferredSale(database, AUTHORIZED);
    const heldRecords = records();
    const heldDocuments = documents();

    expect(applyReplenishedDeferredSaleSatisfaction(database, SATISFIED)).toBe("applied");

    expect(records()).toEqual(heldRecords);
    expect(documents()).toEqual(heldDocuments);
  });

  it("lets the satisfaction of a pending record satisfy it with that document", () => {
    rebuildReplenishedUnclearDeferredSale(database, PENDING);

    expect(applyReplenishedDeferredSaleSatisfaction(database, SATISFIED)).toBe("applied");

    expect(satisfactions()).toMatchObject([{ satisfied_by_fiscal_document_id: "document-1" }]);
  });

  it("never puts the rebuilt record in the outbox", () => {
    rebuildReplenishedUnclearDeferredSale(database, AUTHORIZED);

    expect(database.prepare("SELECT count(*) AS total FROM outbox").get()).toEqual({ total: 0 });
  });
});
