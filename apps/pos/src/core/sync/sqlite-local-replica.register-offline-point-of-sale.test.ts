import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { RegisterPulledChange } from "./pulled-change";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import {
  openAdoptedReplica,
  savePulledChanges,
  TEST_PEPPER,
} from "./test-support/sqlite-local-replica";

const REGISTER_ID = "4b0e6dc3-85f7-4a4b-8c9d-1e3f5a7b9c04";

function offlinePointOfSaleChange(
  changeSeq: number,
  pointOfSaleNumber: number,
  version: number,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "register_offline_point_of_sale",
    entity_id: REGISTER_ID,
    row: { point_of_sale_number: pointOfSaleNumber, version },
  };
  return { changeSeq, change };
}

function save(...changes: RegisterPulledChange[]) {
  return savePulledChanges(replica, ...changes);
}

function savedOfflinePointsOfSale() {
  return database
    .prepare(
      "SELECT register_id, point_of_sale_number, version FROM register_offline_point_of_sale",
    )
    .all();
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
});

afterEach(() => {
  database.close();
});

describe("the register's local copy of its own offline point of sale", () => {
  it("holds none before it is pulled", () => {
    expect(savedOfflinePointsOfSale()).toEqual([]);
  });

  it("saves the point of sale number", async () => {
    await save(offlinePointOfSaleChange(1, 31, 1));

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 31, version: 1 },
    ]);
  });

  it("replaces it with a newer version", async () => {
    await save(offlinePointOfSaleChange(1, 31, 1));

    await save(offlinePointOfSaleChange(2, 32, 2));

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 32, version: 2 },
    ]);
  });

  it("keeps it when the same or an older version arrives late", async () => {
    await save(offlinePointOfSaleChange(1, 32, 3));

    await save(offlinePointOfSaleChange(2, 31, 2), offlinePointOfSaleChange(3, 33, 3));

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 32, version: 3 },
    ]);
  });

  it("keeps the newest of versions delivered out of order in one page", async () => {
    await save(
      offlinePointOfSaleChange(1, 33, 3),
      offlinePointOfSaleChange(2, 31, 1),
      offlinePointOfSaleChange(3, 32, 2),
    );

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 33, version: 3 },
    ]);
  });

  it("holds none once another installation takes over, until that one pulls its own", async () => {
    await save(offlinePointOfSaleChange(1, 31, 4));

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });
    expect(savedOfflinePointsOfSale()).toEqual([]);
    await save(offlinePointOfSaleChange(1, 40, 1));

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 40, version: 1 },
    ]);
  });

  it("keeps it for the installation that pulled it", async () => {
    await save(offlinePointOfSaleChange(1, 31, 1));

    replica.adoptDevice({ deviceId: "device-a", pepper: TEST_PEPPER });

    expect(savedOfflinePointsOfSale()).toHaveLength(1);
  });
});
