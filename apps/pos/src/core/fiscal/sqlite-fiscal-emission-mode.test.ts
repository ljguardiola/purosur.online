import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { readFiscalEmissionModeIn } from "./sqlite-fiscal-emission-mode";
import {
  insertCompletedSale,
  insertFiscalDocument,
  insertHealthCheck,
  insertOfflineAuthorizationCode,
  insertOfflineNumberBlock,
  insertOfflinePointOfSale,
  insertPointOfSale,
  OFFLINE_POINT_OF_SALE,
  openFiscalDatabase,
  POINT_OF_SALE,
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
});

afterEach(() => {
  database.close();
});

describe("the fiscal emission mode, in the local database", () => {
  it("is real time while the register is online and the tax authority's count is known", () => {
    insertHealthCheck(database);
    insertPointOfSale(database, 40);

    expect(readFiscalEmissionModeIn(database, NOW)).toEqual({ kind: "real_time" });
  });

  it("is the offline code without connectivity when the register holds a code and a block", () => {
    insertHealthCheck(database, { arcaReachable: false });
    insertPointOfSale(database, 40);
    holdACode();

    expect(readFiscalEmissionModeIn(database, NOW)).toEqual({
      kind: "offline_code",
      cause: "no_connectivity",
    });
  });

  it("is the offline code while the numbering is frozen", () => {
    insertHealthCheck(database);
    insertPointOfSale(database, 40, POINT_OF_SALE, true);
    holdACode();

    expect(readFiscalEmissionModeIn(database, NOW)).toEqual({
      kind: "offline_code",
      cause: "numbering_conflict",
    });
  });

  it("is the offline code while a document's outcome is unknown", () => {
    insertHealthCheck(database);
    insertPointOfSale(database, 40);
    insertCompletedSale(database, "sale-1");
    insertFiscalDocument(database, { state: "UNKNOWN" });
    holdACode();

    expect(readFiscalEmissionModeIn(database, NOW)).toEqual({
      kind: "offline_code",
      cause: "unclear_outcome",
    });
  });

  it("is deferring when the register is offline and holds no code", () => {
    insertPointOfSale(database, 40);

    expect(readFiscalEmissionModeIn(database, NOW)).toEqual({
      kind: "deferring",
      reason: "fiscally_offline",
    });
  });

  it("looks the code up for the fortnight of the moment it is given", () => {
    insertPointOfSale(database, 40);
    holdACode();

    expect(readFiscalEmissionModeIn(database, new Date("2026-10-02T12:00:00.000Z"))).toEqual({
      kind: "deferring",
      reason: "fiscally_offline",
    });
  });
});
