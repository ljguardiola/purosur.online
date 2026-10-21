import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { readFiscalEmissionModeIn } from "./sqlite-fiscal-emission-mode";
import { insertPreEmissionGateOutcome } from "./sqlite-pre-emission-gate";
import {
  insertCompletedSale,
  insertHealthCheck,
  insertOfflineAuthorizationCode,
  insertOfflineNumberBlock,
  insertOfflinePointOfSale,
  insertPointOfSale,
  OFFLINE_POINT_OF_SALE,
  openFiscalDatabase,
} from "./test-support/real-time-authorization-database";

const NOW = new Date("2026-09-30T12:05:00.000Z");

let database: LocalDatabase;

function holdACode(): void {
  insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
  insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
  insertOfflineAuthorizationCode(database);
}

beforeEach(() => {
  database = openFiscalDatabase();
  insertPointOfSale(database, 40);
  insertHealthCheck(database, { arcaReachable: false });
  holdACode();
});

afterEach(() => {
  database.close();
});

describe("the fiscal emission mode, in the local database", () => {
  it("answers the mode of the register's series, connectivity and held code", () => {
    expect(readFiscalEmissionModeIn(database, NOW)).toEqual({
      kind: "offline_code",
      cause: "no_connectivity",
    });
  });

  it("looks the code up for the fortnight of the moment it is given", () => {
    expect(readFiscalEmissionModeIn(database, new Date("2026-10-02T12:00:00.000Z"))).toEqual({
      kind: "deferring",
      reason: "fiscally_offline",
    });
  });

  it("answers the register's latest pre-emission gate", () => {
    insertCompletedSale(database, "sale-1");
    insertPreEmissionGateOutcome(database, {
      saleId: "sale-1",
      evaluatedAt: NOW,
      outcome: { kind: "failed", reason: "legal_name_missing" },
    });

    expect(readFiscalEmissionModeIn(database, NOW)).toEqual({
      kind: "deferring",
      reason: "pre_emission_gate_failed",
    });
  });
});
