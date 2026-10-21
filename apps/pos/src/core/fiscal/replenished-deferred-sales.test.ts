import {
  A_DEFERRED_SALE_RECORDED_FACT,
  aCompletedSaleFact,
} from "@purosur/domain/sync/test-support";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { insertOpenedSession } from "../register/sqlite-cash-ledger";
import { applyReplenishedSaleFact } from "../sales/replenished-sale-facts";
import {
  applyReplenishedDeferredSale,
  holdsDeferredSaleRecord,
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
