import { aCompletedSaleFact } from "@purosur/domain/sync/test-support";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { insertOpenedSession } from "../register/sqlite-cash-ledger";
import { applyReplenishedSaleFact } from "../sales/replenished-sale-facts";
import { applyReplenishedGateFailure } from "./replenished-gate-failures";

type GateFailure = Extract<SyncedFact, { kind: "fiscal_gate_failed" }>;

let database: LocalDatabase;

function failure(saleId = "sale-1"): GateFailure {
  return {
    kind: "fiscal_gate_failed",
    gateFailure: {
      saleId,
      reason: "issuer_identification_missing",
      evaluatedAt: new Date("2026-10-07T10:00:01.000Z"),
    },
  };
}

function outcomes() {
  return database
    .prepare(
      "SELECT sale_id, evaluated_at, outcome, failure_reason, document FROM pre_emission_gate_outcomes",
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

describe("replenishing a failed pre-emission gate into a restored register", () => {
  it("holds the sale's gate as failed, with why and when it was evaluated", () => {
    applyReplenishedGateFailure(database, failure());

    expect(outcomes()).toEqual([
      {
        sale_id: "sale-1",
        evaluated_at: "2026-10-07T10:00:01.000Z",
        outcome: "FAILED",
        failure_reason: "issuer_identification_missing",
        document: null,
      },
    ]);
  });

  it("changes nothing when the snapshot already holds the sale's gate", () => {
    applyReplenishedGateFailure(database, failure());
    const before = outcomes();

    applyReplenishedGateFailure(database, failure());

    expect(outcomes()).toEqual(before);
  });

  it("is refused for a sale the register does not hold", () => {
    expect(() => applyReplenishedGateFailure(database, failure("sale-9"))).toThrow(
      "sale sale-9 is not held",
    );
  });
});
